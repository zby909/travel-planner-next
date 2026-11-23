"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { isSupportedCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { visitFormData } from "@/lib/visit-input";

export type FormState = { error: string };

function stringField(form: FormData, key: string, max: number, required = false): string {
  const text = String(form.get(key) ?? "").trim();
  if (text.length > max || (required && text.length === 0)) throw new Error(`请检查字段「${key}」的长度`);
  return text;
}
function amount(form: FormData, key: string, max = 100_000_000): number {
  const text = String(form.get(key) ?? "").trim();
  if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error(`${key} 应是非负整数`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > max) throw new Error(`${key} 超出允许范围`);
  return number;
}
// 解析逗号分隔的分类字段，去重并限制每项长度。
function listField(form: FormData, key: string, maxItems: number, maxLength: number): string[] {
  const raw = stringField(form, key, maxItems * (maxLength + 2));
  const values = raw.split(/[，,、]/).map(value => value.trim()).filter(Boolean);
  if (values.length > maxItems || values.some(value => value.length > maxLength)) {
    throw new Error(`请检查字段「${key}」的数量或长度`);
  }
  return [...new Set(values)];
}

// 解析逐行填写的路线或景点，并限制条目数量和长度。
function lineListField(form: FormData, key: string, maxItems: number, maxLength: number): string[] {
  const raw = stringField(form, key, maxItems * (maxLength + 2));
  const values = raw.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (values.length > maxItems || values.some(value => value.length > maxLength)) {
    throw new Error(`请检查字段「${key}」的数量或长度`);
  }
  return [...new Set(values)];
}

// 解析可选经纬度并校验地理范围。
function optionalCoordinate(form: FormData, key: string, min: number, max: number): number | null {
  const raw = stringField(form, key, 40);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} 坐标超出有效范围`);
  return value;
}
function errorState(error: unknown): FormState {
  return { error: error instanceof Error ? error.message : "操作失败，请稍后重试" };
}

export async function saveDestinationAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id: string;
  try {
    id = stringField(form, "id", 64, true);

    const budget = {
      budgetFood: amount(form, "budgetFood"),
      budgetAccommodation: amount(form, "budgetAccommodation"),
      budgetTransport: amount(form, "budgetTransport"),
      budgetOther: amount(form, "budgetOther"),
    };
    const pickBudget = Object.values(budget).reduce((sum, n) => sum + n, 0);
    const minBudget = amount(form, "minBudget", 400_000_000);
    const maxBudget = amount(form, "maxBudget", 400_000_000);
    if (maxBudget < minBudget) throw new Error("预算上限不能低于下限");
    if (pickBudget < minBudget || pickBudget > maxBudget) throw new Error("预算分项合计必须落在预算区间内");

    const rawCurrency = stringField(form, "currency", 3);
    if (rawCurrency && !isSupportedCurrency(rawCurrency)) throw new Error("暂不支持该预算币种");
    const rawFlag = form.get("flag");
    const parsedFlag = rawFlag === null ? null : (stringField(form, "flag", 12) || "🌍");

    const title = stringField(form, "title", 100, true);
    const kind = stringField(form, "kind", 80);
    const types = listField(form, "types", 12, 40);
    const seasons = listField(form, "seasons", 4, 10);
    const route = lineListField(form, "routeItems", 60, 200);
    const spots = lineListField(form, "spotItems", 60, 120);
    const guideIntro = stringField(form, "guideIntro", 4000);
    const guidePace = stringField(form, "guidePace", 2000);
    const guideStay = stringField(form, "guideStay", 2000);
    const guideTransport = stringField(form, "guideTransport", 2000);
    const dayLabels = form.getAll("guideDayLabel").map(value => String(value).trim());
    const dayTitles = form.getAll("guideDayTitle").map(value => String(value).trim());
    const dayDetails = form.getAll("guideDayDetail").map(value => String(value).trim());
    if (dayLabels.length > 30 || dayTitles.length !== dayLabels.length || dayDetails.length !== dayLabels.length) {
      throw new Error("每日攻略最多 30 天，请检查行程字段");
    }
    if (dayLabels.some(day => day.length > 40)) throw new Error("每日攻略的天数标签不能超过 40 个字符");
    const guideDays = dayLabels.map((day, index) => ({ day, title: dayTitles[index], detail: dayDetails[index] }))
      .filter(item => item.title || item.detail);
    if (guideDays.some(item => !item.day || !item.title || !item.detail || item.title.length > 160 || item.detail.length > 3000)) {
      throw new Error("每日攻略需要填写天数、标题和行程说明，且不能超过长度限制");
    }
    const hasGuide = Boolean(guideIntro || guidePace || guideStay || guideTransport || guideDays.length);
    const baseData = {
      title,
      subtitle: stringField(form, "subtitle", 160, true),
      kind,
      typesJson: JSON.stringify(types.length ? types : kind ? [kind] : []),
      seasonsJson: JSON.stringify(seasons),
      months: stringField(form, "months", 100),
      days: stringField(form, "days", 50),
      vibe: stringField(form, "vibe", 220),
      reason: stringField(form, "reason", 3000),
      groupText: stringField(form, "groupText", 1500),
      spotsJson: JSON.stringify(spots),
      routeJson: JSON.stringify(route),
      minBudget,
      maxBudget,
      pickBudget,
      ...budget,
    };
    await prisma.$transaction(async (tx) => {
      const existing = await tx.destination.findUnique({ where: { id }, select: { title: true, currency: true, flag: true } });
      if (!existing) throw new Error("目的地不存在");
      if (title !== existing.title && await tx.destination.findFirst({ where: { id: { not: id }, title }, select: { id: true } })) {
        throw new Error("另一个目的地已经使用相同名称");
      }
      await tx.destination.update({
        where: { id },
        data: { ...baseData, currency: rawCurrency || existing.currency, flag: parsedFlag ?? existing.flag },
      });
      if (hasGuide) {
        await tx.destinationGuide.upsert({
          where: { destinationId: id },
          update: { intro: guideIntro, pace: guidePace, stay: guideStay, transport: guideTransport },
          create: { destinationId: id, intro: guideIntro, pace: guidePace, stay: guideStay, transport: guideTransport },
        });
        await tx.guideDay.deleteMany({ where: { guideId: id } });
        if (guideDays.length) await tx.guideDay.createMany({
          data: guideDays.map((day, sortOrder) => ({ ...day, id: randomUUID(), guideId: id, sortOrder })),
        });
      } else {
        await tx.destinationGuide.deleteMany({ where: { destinationId: id } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "目的地", entityId: id, summary: baseData.title } });
    });
    revalidatePath("/");
    revalidatePath(`/destinations/${id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/destinations");
    revalidatePath(`/admin/destinations/${id}`);
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/destinations/${encodeURIComponent(id)}?saved=1`);
}

// 创建目的地时先写入可用的通用默认值，预算和攻略可在后续编辑中补齐。
export async function createDestinationAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id = "";
  try {
    const title = stringField(form, "title", 100, true);
    const kind = stringField(form, "kind", 80) || "其他";
    const types = listField(form, "types", 12, 40);
    const seasons = listField(form, "seasons", 4, 10);
    const spots = lineListField(form, "spotItems", 60, 120);
    const route = lineListField(form, "routeItems", 60, 200);
    id = randomUUID();
    const data = {
      id,
      title,
      subtitle: stringField(form, "subtitle", 160, true),
      imagePath: "/images/destination-placeholder.svg",
      flag: stringField(form, "flag", 12) || "🌍",
      kind,
      typesJson: JSON.stringify(types.length ? types : [kind]),
      months: stringField(form, "months", 100),
      seasonsJson: JSON.stringify(seasons),
      days: stringField(form, "days", 50) || "待规划",
      minBudget: 0,
      maxBudget: 0,
      pickBudget: 0,
      budgetFood: 0,
      budgetAccommodation: 0,
      budgetTransport: 0,
      budgetOther: 0,
      groupText: "",
      vibe: stringField(form, "vibe", 220),
      reason: stringField(form, "reason", 3000),
      spotsJson: JSON.stringify(spots),
      routeJson: JSON.stringify(route),
    };
    await prisma.$transaction(async tx => {
      if (await tx.destination.findFirst({ where: { title }, select: { id: true } })) throw new Error("已经存在同名目的地");
      const [latest, setting] = await Promise.all([
        tx.destination.aggregate({ _max: { rank: true } }),
        tx.appSetting.findUnique({ where: { key: "currency" } }),
      ]);
      await tx.destination.create({ data: { ...data, rank: (latest._max.rank ?? -1) + 1, currency: setting?.value || "CNY" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "目的地", entityId: id, summary: title } });
    });
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/destinations");
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/destinations/${encodeURIComponent(id)}?created=1`);
}

// 一次保存地点与首次到访，后续到访从已有地点添加。
export async function createPlaceAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id = "";
  try {
    const visit = visitFormData(form);
    const latitude = optionalCoordinate(form, "latitude", -90, 90);
    const longitude = optionalCoordinate(form, "longitude", -180, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("经纬度必须同时填写");
    const name = stringField(form, "name", 100, true);
    const region = stringField(form, "region", 160, true);
    id = randomUUID();
    const data = {
      id,
      name,
      region,
      image: "images/place-placeholder.svg",
      latitude,
      longitude,
      country: stringField(form, "country", 80) || null,
      province: stringField(form, "province", 80) || null,
      city: stringField(form, "city", 100) || null,
      mapNote: stringField(form, "mapNote", 1200) || null,
    };
    await prisma.$transaction(async tx => {
      if (await tx.visitedPlace.findFirst({ where: { name, region }, select: { id: true } })) {
        throw Error("这个地点已经记录过，请在原地点下添加一次到访");
      }
      const latest = await tx.visitedPlace.aggregate({ _max: { sortOrder: true } });
      await tx.visitedPlace.create({ data: {
        ...data, sortOrder: (latest._max.sortOrder ?? -1) + 1, visits: { create: visit },
      } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "足迹地点", entityId: id, summary: data.name } });
    });
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/places");
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/places/${encodeURIComponent(id)}?created=1`);
}

// 仅允许管理员修改站点品牌、成员显示名和默认预算币种。
export async function saveSiteSettingsAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  if (actor.role !== "ADMIN") return { error: "只有管理员可以修改站点设置" };
  try {
    const currency = stringField(form, "currency", 3, true);
    const visibility = stringField(form, "visibility", 10) || "PUBLIC";
    if (!isSupportedCurrency(currency)) throw new Error("暂不支持该币种");
    if (visibility !== "PUBLIC" && visibility !== "PRIVATE") throw new Error("站点访问模式无效");
    const albumMaxPhotos = amount(form, "albumMaxPhotos", 500);
    const albumMaxMiB = amount(form, "albumMaxMiB", 256);
    if (!albumMaxPhotos || !albumMaxMiB) throw Error("相册容量需要大于零");
    const settings = [
      ["siteName", stringField(form, "siteName", 40, true)],
      ["siteSubtitle", stringField(form, "siteSubtitle", 60)],
      ["primaryMemberName", stringField(form, "primaryMemberName", 30, true)],
      ["secondaryMemberName", stringField(form, "secondaryMemberName", 30, true)],
      ["togetherLabel", stringField(form, "togetherLabel", 40, true)],
      ["currency", currency],
      ["visibility", visibility],
      ["albumMaxPhotos", String(albumMaxPhotos)],
      ["albumMaxMiB", String(albumMaxMiB)],
    ] as const;
    await prisma.$transaction(async tx => {
      for (const [key, value] of settings) {
        await tx.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "站点设置", entityId: "site", summary: settings.map(([key, value]) => `${key}=${value}`).join("; ").slice(0, 500) } });
    });
    revalidatePath("/", "layout");
  } catch (error) {
    return errorState(error);
  }
  redirect("/admin/settings?saved=1");
}

// 仅编辑地点自身的名称、地区及地图资料。
export async function savePlaceAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id: string;
  try {
    id = stringField(form, "id", 64, true);
    const latitude = optionalCoordinate(form, "latitude", -90, 90);
    const longitude = optionalCoordinate(form, "longitude", -180, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("经纬度必须同时填写");
    const name = stringField(form, "name", 100, true);
    const region = stringField(form, "region", 160, true);
    const data = {
      name,
      region,
      country: stringField(form, "country", 80) || null,
      province: stringField(form, "province", 80) || null,
      city: stringField(form, "city", 100) || null,
      latitude,
      longitude,
      mapNote: stringField(form, "mapNote", 1200) || null,
    };
    await prisma.$transaction(async (tx) => {
      const original = await tx.visitedPlace.findUnique({ where: { id }, select: { name: true, region: true } });
      if (!original) throw new Error("足迹地点不存在");
      if ((name !== original.name || region !== original.region) &&
          await tx.visitedPlace.findFirst({ where: { id: { not: id }, name, region }, select: { id: true } })) {
        throw new Error("另一个足迹地点已使用相同名称和地区");
      }
      await tx.visitedPlace.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "足迹地点", entityId: id, summary: data.name } });
    });
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath(`/visited/${id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/places");
    revalidatePath(`/admin/places/${id}`);
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/places/${encodeURIComponent(id)}?saved=1`);
}
