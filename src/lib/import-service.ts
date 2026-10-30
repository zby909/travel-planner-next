import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { importPayloadSchema, type ImportPayload } from "@/lib/import-schema";
import { commitRecordChange, prepareRecordChange } from "@/lib/record-change-service";

export async function loadImportImage(imageId: string | undefined, ownerId: string) {
  if (!imageId) return null;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: imageId } });
  if (!asset || asset.ownerId !== ownerId || !["STAGED", "PUBLIC"].includes(asset.status)) {
    throw new Error(`图片 ${imageId} 不存在或不是当前用户上传`);
  }
  return asset;
}

export async function prepareImport(payload: unknown, ownerId: string) {
  const data = importPayloadSchema.parse(payload);
  if (data.kind === "visits-update" || data.kind === "destinations-update" || data.kind === "timeline") {
    return prepareRecordChange(data, ownerId);
  }
  const warnings: string[] = [];
  const mediaIds = [...new Set(data.items.flatMap(item => item.imageId ? [item.imageId] : []))];
  for (const id of mediaIds) await loadImportImage(id, ownerId);

  if (data.kind === "visits") {
    const placeKeys = new Set<string>();
    for (const item of data.items) {
      const key = (item.name + "::" + item.region).toLowerCase();
      if (placeKeys.has(key)) throw new Error(`导入批次中存在重复地点：${item.name}`);
      placeKeys.add(key);
      const existing = await prisma.visitedPlace.findFirst({ where: { name: item.name, region: item.region }, select: { id: true } });
      if (existing) warnings.push(`${item.name}：地点已存在，确认导入后将跳过，避免覆盖现有数据`);
      if (item.latitude === undefined && !existing) {
        warnings.push(`${item.name}：缺少经纬度，将保存到足迹列表，但不会在地图上生成坐标点`);
      }
      if (!item.when) warnings.push(`${item.name}：未提供到访年月，不会编造日期或时间轴事件`);
    }
  } else {
    const names = new Set<string>();
    for (const item of data.items) {
      const key = item.title.toLowerCase();
      if (names.has(key)) throw new Error(`导入批次包含重复目的地：${item.title}`);
      names.add(key);
      if (await prisma.destination.findFirst({ where: { title: item.title }, select: { id: true } })) {
        warnings.push(`${item.title}：目的地已存在，确认导入后将跳过`);
      }
      if (!item.budget) warnings.push(`${item.title}：未提供预算，将标记为待估算，不生成虚假报价`);
    }
  }

  const draft = await prisma.importDraft.create({
    data: {
      ownerId,
      kind: data.kind,
      payloadJson: JSON.stringify(data),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { draftId: draft.id, kind: data.kind, items: data.items, warnings, expiresAt: draft.expiresAt.toISOString() };
}

export async function commitImport(draftId: string, ownerId: string) {
  const draft = await prisma.importDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.ownerId !== ownerId || draft.status !== "PREPARED" || draft.expiresAt < new Date()) {
    throw new Error("草稿不存在、已提交或已过期");
  }
  const data: ImportPayload = importPayloadSchema.parse(JSON.parse(draft.payloadJson));
  if (data.kind === "visits-update" || data.kind === "destinations-update" || data.kind === "timeline") {
    return commitRecordChange(draftId, data, ownerId);
  }
  const mediaIds = [...new Set(data.items.flatMap(item => item.imageId ? [item.imageId] : []))];
  for (const id of mediaIds) await loadImportImage(id, ownerId);

  const result = await prisma.$transaction(async tx => {
    // Atomic compare-and-set prevents two concurrent commits of the same draft.
    const locked = await tx.importDraft.updateMany({
      where: { id: draftId, ownerId, status: "PREPARED", expiresAt: { gt: new Date() } },
      data: { status: "COMMITTING" },
    });
    if (locked.count !== 1) throw new Error("草稿已被其他请求提交，请勿重复执行");
    const created: { id: string; name: string }[] = [];
    const skipped: string[] = [];
    if (data.kind === "visits") {
      let sortOrder = (await tx.visitedPlace.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
      for (const item of data.items) {
        const existing = await tx.visitedPlace.findFirst({ where: { name: item.name, region: item.region } });
        if (existing) { skipped.push(item.name); continue; }
        const place = await tx.visitedPlace.create({
          data: {
            id: randomUUID(),
            group: item.group, name: item.name, region: item.region,
            image: item.imageId ? `api/media/${item.imageId}` : "images/place-placeholder.svg",
            whenLabel: item.when || "",
            sortOrder: ++sortOrder,
            longitude: item.longitude ?? null, latitude: item.latitude ?? null,
            country: item.country ?? null, province: item.province ?? null, city: item.city ?? null,
            mapNote: item.note ?? null,
          },
        });
        if (item.when) {
          const [year, month] = item.when.split("-");
          const date = month ? `${year}.${month}` : year;
          const timeline = await tx.timelineEntry.create({
            data: { id: randomUUID(), year: Number(year), date, group: item.group, title: item.name, note: item.note ?? "", sortOrder: 0 },
          });
          await tx.timelinePlace.create({ data: { timelineEntryId: timeline.id, placeId: place.id, sortOrder: 0 } });
        }
        created.push({ id: place.id, name: item.name });
      }
    } else {
      let rank = (await tx.destination.aggregate({ _max: { rank: true } }))._max.rank ?? 0;
      for (const item of data.items) {
        const found = await tx.destination.findFirst({ where: { title: item.title } });
        if (found) { skipped.push(item.title); continue; }
        const b = item.budget ?? { flight: 0, hotel: 0, group: 0, food: 0, tickets: 0, transport: 0, other: 0 };
        const sum = Object.values(b).reduce((a, x) => a + x, 0);
        const dest = await tx.destination.create({
          data: {
            id: randomUUID(),
            title: item.title, subtitle: item.subtitle, flag: "✈️", kind: "旅行计划",
            typesJson: "[]", months: item.months ?? "", seasonsJson: "[]", days: item.days ?? "",
            minBudget: item.minBudget ?? sum, maxBudget: item.maxBudget ?? sum, pickBudget: sum,
            rank: ++rank,
            budgetFlight: b.flight, budgetHotel: b.hotel, budgetGroup: b.group, budgetFood: b.food,
            budgetTickets: b.tickets, budgetTransport: b.transport, budgetOther: b.other,
            groupText: "", flightNote: "", vibe: item.vibe ?? "", reason: item.reason ?? "",
            spotsJson: JSON.stringify(item.spots), routeJson: JSON.stringify(item.route),
            imagePath: item.imageId ? `/api/media/${item.imageId}` : "/images/destination-placeholder.svg",
          },
        });
        if (item.guideDays.length) {
          await tx.destinationGuide.create({
            data: {
              destinationId: dest.id, intro: "AI 导入的待确认行程",
              pace: "", stay: "", transport: "",
              days: { create: item.guideDays.map((day, i) => ({
                id: randomUUID(), day: `D${i+1}`, title: day.title, detail: day.detail, sortOrder: i,
              })) },
            },
          });
        }
        created.push({ id: dest.id, name: item.title });
      }
    }
    for (const id of mediaIds) {
      if (data.items.some(i => i.imageId === id && created.some(c => c.name === ("name" in i ? i.name : i.title)))) {
        await tx.mediaAsset.update({ where: { id, ownerId }, data: { status: "PUBLIC" } });
      }
    }
    await tx.importDraft.update({ where: { id: draftId }, data: { status: "COMMITTED", committedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: ownerId, action: "导入", entity: data.kind === "visits" ? "足迹" : "未来目的地",
        entityId: draftId, summary: `新增 ${created.length}，跳过 ${skipped.length}`,
      },
    });
    return { kind: data.kind, created, skipped };
  });
  return result;
}
