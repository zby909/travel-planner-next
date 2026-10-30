import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ImportPayload } from "@/lib/import-schema";

type ChangePayload = Extract<ImportPayload, { kind: "visits-update" | "destinations-update" | "timeline" }>;
type ChangeItem = ChangePayload["items"][number];

async function validateImage(imageId: string | null | undefined, ownerId: string) {
  if (!imageId) return;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: imageId } });
  if (!asset || asset.ownerId !== ownerId || !["STAGED", "PUBLIC"].includes(asset.status)) {
    throw new Error(`图片 ${imageId} 不存在或不是当前用户上传`);
  }
}

async function validatePlaceIds(placeIds: string[] | undefined) {
  if (!placeIds?.length) return;
  const found = await prisma.visitedPlace.findMany({ where: { id: { in: placeIds } }, select: { id: true } });
  if (found.length !== placeIds.length) throw new Error("时间轴关联的足迹地点不存在或已被删除");
}

function parseArray(value: string): unknown[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function destinationBudget(existing: {
  budgetFlight: number; budgetHotel: number; budgetGroup: number; budgetFood: number;
  budgetTickets: number; budgetTransport: number; budgetOther: number;
  minBudget: number; maxBudget: number;
}, patch: Extract<ImportPayload, { kind: "destinations-update" }>["items"][number]) {
  const next = {
    budgetFlight: patch.budget?.flight ?? existing.budgetFlight,
    budgetHotel: patch.budget?.hotel ?? existing.budgetHotel,
    budgetGroup: patch.budget?.group ?? existing.budgetGroup,
    budgetFood: patch.budget?.food ?? existing.budgetFood,
    budgetTickets: patch.budget?.tickets ?? existing.budgetTickets,
    budgetTransport: patch.budget?.transport ?? existing.budgetTransport,
    budgetOther: patch.budget?.other ?? existing.budgetOther,
  };
  const sum = Object.values(next).reduce((total, value) => total + value, 0);
  const minBudget = patch.minBudget ?? existing.minBudget;
  const maxBudget = patch.maxBudget ?? existing.maxBudget;
  const changed = Boolean(patch.budget || patch.minBudget !== undefined || patch.maxBudget !== undefined);
  if (changed && (minBudget > maxBudget || sum < minBudget || sum > maxBudget)) {
    throw new Error("更新后的预算分项合计必须落在预算区间内；请同时调整预算分项或上下限");
  }
  return { ...next, minBudget, maxBudget, pickBudget: changed ? sum : undefined };
}

export async function prepareRecordChange(payload: ChangePayload, ownerId: string) {
  const warnings: string[] = [];
  const before: Array<{ id: string; current: unknown; changes: ChangeItem }> = [];
  const seen = new Set<string>();

  if (payload.kind === "visits-update") {
    for (const item of payload.items) {
      if (seen.has(item.id)) throw new Error("同一批次不能重复更新相同足迹");
      seen.add(item.id);
      const existing = await prisma.visitedPlace.findUnique({ where: { id: item.id } });
      if (!existing) throw new Error(`足迹不存在：${item.id}`);
      const nextName = item.name ?? existing.name;
      const nextRegion = item.region ?? existing.region;
      if ((item.name !== undefined || item.region !== undefined) &&
          await prisma.visitedPlace.findFirst({ where: { id: { not: item.id }, name: nextName, region: nextRegion }, select: { id: true } })) {
        throw new Error(`另一个足迹已使用相同名称和地区：${nextName} · ${nextRegion}`);
      }
      await validateImage(item.imageId, ownerId);
      before.push({ id: item.id, current: existing, changes: item });
    }
  } else if (payload.kind === "destinations-update") {
    for (const item of payload.items) {
      if (seen.has(item.id)) throw new Error("同一批次不能重复更新相同目的地");
      seen.add(item.id);
      const existing = await prisma.destination.findUnique({
        where: { id: item.id },
        include: { flightPricing: true, guide: { include: { days: { orderBy: { sortOrder: "asc" } } } } },
      });
      if (!existing) throw new Error(`未来目的地不存在：${item.id}`);
      const nextTitle = item.title ?? existing.title;
      if (item.title !== undefined && await prisma.destination.findFirst({ where: { id: { not: item.id }, title: nextTitle }, select: { id: true } })) {
        throw new Error(`另一个目的地已使用相同名称：${nextTitle}`);
      }
      destinationBudget(existing, item);
      await validateImage(item.imageId, ownerId);
      before.push({ id: item.id, current: {
        id: existing.id, title: existing.title, subtitle: existing.subtitle, months: existing.months, days: existing.days,
        minBudget: existing.minBudget, maxBudget: existing.maxBudget, pickBudget: existing.pickBudget,
        budget: { flight: existing.budgetFlight, hotel: existing.budgetHotel, group: existing.budgetGroup,
          food: existing.budgetFood, tickets: existing.budgetTickets, transport: existing.budgetTransport, other: existing.budgetOther },
        vibe: existing.vibe, reason: existing.reason, imagePath: existing.imagePath,
        groupText: existing.groupText, flightNote: existing.flightNote, flightSource: existing.flightSource,
        route: parseArray(existing.routeJson), spots: parseArray(existing.spotsJson),
        flightPricing: existing.flightPricing,
        guideDays: existing.guide?.days.map(day => ({ title: day.title, detail: day.detail })) ?? [],
      }, changes: item });
    }
  } else {
    for (const item of payload.items) {
      const key = item.id ?? `new:${item.year}:${item.date}:${item.title}`;
      if (seen.has(key)) throw new Error("同一批次不能重复操作相同时间轴事件");
      seen.add(key);
      const existing = item.id ? await prisma.timelineEntry.findUnique({
        where: { id: item.id }, include: { places: { include: { place: { select: { id: true, name: true, region: true } } } } },
      }) : null;
      if (item.id && !existing) throw new Error(`时间轴事件不存在：${item.id}`);
      await validatePlaceIds(item.placeIds);
      before.push({ id: item.id ?? "(new)", current: existing, changes: item });
      if (item.placeIds?.length) warnings.push(`${item.title ?? existing?.title ?? "时间轴事件"}：将关联 ${item.placeIds.length} 个足迹地点`);
    }
  }

  const draft = await prisma.importDraft.create({
    data: { ownerId, kind: payload.kind, payloadJson: JSON.stringify(payload), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  return { draftId: draft.id, kind: payload.kind, items: payload.items, before, warnings,
    expiresAt: draft.expiresAt.toISOString() };
}

export async function commitRecordChange(draftId: string, payload: ChangePayload, ownerId: string) {
  const mediaIds = payload.kind === "visits-update" || payload.kind === "destinations-update"
    ? [...new Set(payload.items.flatMap(item => typeof item.imageId === "string" ? [item.imageId] : []))]
    : [];
  for (const id of mediaIds) await validateImage(id, ownerId);

  return prisma.$transaction(async tx => {
    const locked = await tx.importDraft.updateMany({
      where: { id: draftId, ownerId, kind: payload.kind, status: "PREPARED", expiresAt: { gt: new Date() } },
      data: { status: "COMMITTING" },
    });
    if (locked.count !== 1) throw new Error("草稿不存在、已提交或已过期");

    const updated: Array<{ id: string; name: string }> = [];
    const created: Array<{ id: string; name: string }> = [];

    if (payload.kind === "visits-update") {
      for (const item of payload.items) {
        const existing = await tx.visitedPlace.findUnique({ where: { id: item.id } });
        if (!existing) throw new Error(`提交时足迹已不存在：${item.id}`);
        const name = item.name ?? existing.name;
        const region = item.region ?? existing.region;
        if ((item.name !== undefined || item.region !== undefined) &&
            await tx.visitedPlace.findFirst({ where: { id: { not: item.id }, name, region }, select: { id: true } })) {
          throw new Error(`提交冲突：另一个足迹已使用 ${name} · ${region}`);
        }
        await tx.visitedPlace.update({ where: { id: item.id }, data: {
          ...(item.name !== undefined ? { name: item.name } : {}),
          ...(item.region !== undefined ? { region: item.region } : {}),
          ...(item.when !== undefined ? { whenLabel: item.when } : {}),
          ...(item.group !== undefined ? { group: item.group } : {}),
          ...(item.country !== undefined ? { country: item.country } : {}),
          ...(item.province !== undefined ? { province: item.province } : {}),
          ...(item.city !== undefined ? { city: item.city } : {}),
          ...(item.latitude !== undefined ? { latitude: item.latitude } : {}),
          ...(item.longitude !== undefined ? { longitude: item.longitude } : {}),
          ...(item.note !== undefined ? { mapNote: item.note } : {}),
          ...(item.sortOrder !== undefined ? { sortOrder: item.sortOrder } : {}),
          ...(item.imageId !== undefined ? { image: item.imageId ? `api/media/${item.imageId}` : "images/place-placeholder.svg" } : {}),
        } });
        if (typeof item.imageId === "string") await tx.mediaAsset.update({ where: { id: item.imageId }, data: { status: "PUBLIC" } });
        updated.push({ id: item.id, name });
      }
    } else if (payload.kind === "destinations-update") {
      for (const item of payload.items) {
        const existing = await tx.destination.findUnique({ where: { id: item.id } });
        if (!existing) throw new Error(`提交时未来目的地已不存在：${item.id}`);
        const title = item.title ?? existing.title;
        if (item.title !== undefined && await tx.destination.findFirst({ where: { id: { not: item.id }, title }, select: { id: true } })) {
          throw new Error(`提交冲突：另一个目的地已使用名称 ${title}`);
        }
        const budget = destinationBudget(existing, item);
        await tx.destination.update({ where: { id: item.id }, data: {
          ...(item.title !== undefined ? { title: item.title } : {}),
          ...(item.subtitle !== undefined ? { subtitle: item.subtitle } : {}),
          ...(item.months !== undefined ? { months: item.months } : {}),
          ...(item.days !== undefined ? { days: item.days } : {}),
          ...(item.vibe !== undefined ? { vibe: item.vibe } : {}),
          ...(item.reason !== undefined ? { reason: item.reason } : {}),
          ...(item.groupText !== undefined ? { groupText: item.groupText } : {}),
          ...(item.flightNote !== undefined ? { flightNote: item.flightNote } : {}),
          ...(item.flightSource !== undefined ? { flightSource: item.flightSource } : {}),
          ...(item.route !== undefined ? { routeJson: JSON.stringify(item.route) } : {}),
          ...(item.spots !== undefined ? { spotsJson: JSON.stringify(item.spots) } : {}),
          ...(item.minBudget !== undefined ? { minBudget: budget.minBudget } : {}),
          ...(item.maxBudget !== undefined ? { maxBudget: budget.maxBudget } : {}),
          ...(budget.pickBudget !== undefined ? { pickBudget: budget.pickBudget } : {}),
          ...(item.budget?.flight !== undefined ? { budgetFlight: budget.budgetFlight } : {}),
          ...(item.budget?.hotel !== undefined ? { budgetHotel: budget.budgetHotel } : {}),
          ...(item.budget?.group !== undefined ? { budgetGroup: budget.budgetGroup } : {}),
          ...(item.budget?.food !== undefined ? { budgetFood: budget.budgetFood } : {}),
          ...(item.budget?.tickets !== undefined ? { budgetTickets: budget.budgetTickets } : {}),
          ...(item.budget?.transport !== undefined ? { budgetTransport: budget.budgetTransport } : {}),
          ...(item.budget?.other !== undefined ? { budgetOther: budget.budgetOther } : {}),
          ...(item.imageId !== undefined ? { imagePath: item.imageId ? `/api/media/${item.imageId}` : "/images/destination-placeholder.svg" } : {}),
        } });
        if (item.flightPricing !== undefined) {
          if (item.flightPricing === null) await tx.flightPricing.deleteMany({ where: { destinationId: item.id } });
          else await tx.flightPricing.upsert({ where: { destinationId: item.id },
            update: item.flightPricing, create: { destinationId: item.id, ...item.flightPricing } });
        }
        if (item.guideDays !== undefined) {
          const days = item.guideDays.map((day, index) => ({ id: randomUUID(), day: `D${index + 1}`, title: day.title, detail: day.detail, sortOrder: index }));
          const guide = await tx.destinationGuide.findUnique({ where: { destinationId: item.id }, select: { destinationId: true } });
          if (guide) {
            await tx.guideDay.deleteMany({ where: { guideId: item.id } });
            await tx.destinationGuide.update({ where: { destinationId: item.id }, data: { days: { create: days } } });
          } else {
            await tx.destinationGuide.create({ data: { destinationId: item.id, intro: "AI 更新的待确认行程", pace: "", stay: "", transport: "", days: { create: days } } });
          }
        }
        if (typeof item.imageId === "string") await tx.mediaAsset.update({ where: { id: item.imageId }, data: { status: "PUBLIC" } });
        updated.push({ id: item.id, name: title });
      }
    } else {
      for (const item of payload.items) {
        const existing = item.id ? await tx.timelineEntry.findUnique({ where: { id: item.id } }) : null;
        if (item.id && !existing) throw new Error(`提交时找不到时间轴事件：${item.id}`);
        if (item.placeIds?.length) {
          const foundPlaces = await tx.visitedPlace.findMany({ where: { id: { in: item.placeIds } }, select: { id: true } });
          if (foundPlaces.length !== item.placeIds.length) throw new Error("提交时某个关联足迹地点已不存在");
        }
        const id = item.id ?? randomUUID();
        const values = {
          year: item.year ?? existing?.year ?? 0,
          date: item.date ?? existing?.date ?? "",
          group: item.group ?? existing?.group ?? "both",
          title: item.title ?? existing?.title ?? "",
          note: item.note ?? existing?.note ?? "",
          sortOrder: item.sortOrder ?? existing?.sortOrder ?? ((await tx.timelineEntry.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1,
        };
        if (existing) {
          await tx.timelineEntry.update({ where: { id }, data: values });
          updated.push({ id, name: values.title });
        } else {
          await tx.timelineEntry.create({ data: { id, ...values } });
          created.push({ id, name: values.title });
        }
        if (item.placeIds !== undefined) {
          await tx.timelinePlace.deleteMany({ where: { timelineEntryId: id } });
          if (item.placeIds.length) await tx.timelinePlace.createMany({
            data: item.placeIds.map((placeId, index) => ({ timelineEntryId: id, placeId, sortOrder: index })),
          });
        }
      }
    }

    await tx.importDraft.update({ where: { id: draftId }, data: { status: "COMMITTED", committedAt: new Date() } });
    await tx.auditLog.create({
      data: { actorId: ownerId, action: "更新", entity: payload.kind === "visits-update" ? "足迹"
        : payload.kind === "destinations-update" ? "未来目的地" : "旅行时间轴",
        entityId: draftId, summary: `更新 ${updated.length}，新增 ${created.length}` },
    });
    return { kind: payload.kind, updated, created, skipped: [] };
  });
}
