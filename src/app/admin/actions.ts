"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeStoredMediaFiles } from "@/lib/media-storage";
import { attachStoryPhotos, optionalStoryDate, prepareStoryPhotos } from "@/lib/story-photos";

export type FormState = { error: string };

function stringField(form: FormData, key: string, max: number, required = false): string {
  const text = String(form.get(key) ?? "").trim();
  if (text.length > max || (required && text.length === 0)) throw new Error(`请检查字段「${key}」的长度`);
  return text;
}
function amount(form: FormData, key: string, max = 10_000_000): number {
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
    const existing = await prisma.destination.findUnique({ where: { id } });
    if (!existing) throw new Error("目的地不存在");

    const budget = {
      budgetFood: amount(form, "budgetFood"),
      budgetAccommodation: amount(form, "budgetAccommodation"),
      budgetTransport: amount(form, "budgetTransport"),
      budgetOther: amount(form, "budgetOther"),
    };
    const pickBudget = Object.values(budget).reduce((sum, n) => sum + n, 0);
    const minBudget = amount(form, "minBudget");
    const maxBudget = amount(form, "maxBudget");
    if (maxBudget < minBudget) throw new Error("预算上限不能低于下限");
    if (pickBudget < minBudget || pickBudget > maxBudget) throw new Error("预算分项合计必须落在预算区间内");

    const title = stringField(form, "title", 100, true);
    if (title !== existing.title && await prisma.destination.findFirst({ where: { id: { not: id }, title }, select: { id: true } })) {
      throw new Error("另一个目的地已经使用相同名称");
    }
    const kind = stringField(form, "kind", 80);
    const types = listField(form, "types", 12, 40);
    const seasons = listField(form, "seasons", 4, 10);
    const route = lineListField(form, "routeItems", 60, 160);
    const spots = lineListField(form, "spotItems", 60, 100);
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
    const data = {
      title,
      subtitle: stringField(form, "subtitle", 160, true),
      kind,
      typesJson: JSON.stringify(types.length ? types : kind ? [kind] : []),
      seasonsJson: JSON.stringify(seasons),
      months: stringField(form, "months", 100),
      days: stringField(form, "days", 40),
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
      await tx.destination.update({ where: { id }, data });
      if (hasGuide) {
        await tx.destinationGuide.upsert({
          where: { destinationId: id },
          update: { intro: guideIntro, pace: guidePace, stay: guideStay, transport: guideTransport },
          create: { destinationId: id, intro: guideIntro, pace: guidePace, stay: guideStay, transport: guideTransport },
        });
        await tx.guideDay.deleteMany({ where: { guideId: id } });
        for (const [index, day] of guideDays.entries()) {
          await tx.guideDay.create({ data: { id: randomUUID(), guideId: id, day: day.day, title: day.title, detail: day.detail, sortOrder: index } });
        }
      } else {
        await tx.destinationGuide.deleteMany({ where: { destinationId: id } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "目的地", entityId: id, summary: data.title } });
    });
    revalidatePath("/");
    revalidatePath(`/destinations/${id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/destinations");
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
    if (await prisma.destination.findFirst({ where: { title }, select: { id: true } })) throw new Error("已经存在同名目的地");
    const kind = stringField(form, "kind", 80) || "其他";
    const types = listField(form, "types", 12, 40);
    const seasons = listField(form, "seasons", 4, 10);
    const spots = lineListField(form, "spotItems", 40, 80);
    const route = lineListField(form, "routeItems", 60, 160);
    const latest = await prisma.destination.aggregate({ _max: { rank: true } });
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
      rank: (latest._max.rank ?? -1) + 1,
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
      await tx.destination.create({ data });
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

// 创建足迹地点，未填写坐标时仍可正常显示在列表中。
export async function createPlaceAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id = "";
  const written: string[] = [];
  try {
    const group = stringField(form, "group", 8, true);
    if (!["both", "her", "mine"].includes(group)) throw new Error("到访归属无效");
    const latitude = optionalCoordinate(form, "latitude", -90, 90);
    const longitude = optionalCoordinate(form, "longitude", -180, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("经纬度必须同时填写");
    const name = stringField(form, "name", 100, true);
    const region = stringField(form, "region", 160, true);
    if (await prisma.visitedPlace.findFirst({ where: { name, region }, select: { id: true } })) throw new Error("已经存在同名同地区的足迹地点");
    const latest = await prisma.visitedPlace.aggregate({ _max: { sortOrder: true } });
    const storyTitle = stringField(form, "storyTitle", 120);
    const storyContent = stringField(form, "storyContent", 4000);
    const dateText = stringField(form, "storyDate", 10);
    const storyDate = optionalStoryDate(dateText);
    const prepared = await prepareStoryPhotos(form);
    written.push(...prepared.map(photo => photo.fileName));
    const hasStory = Boolean(storyTitle || storyContent || storyDate || prepared.length);
    id = randomUUID();
    const data = {
      id,
      group,
      name,
      region,
      image: prepared[0] ? `api/media/${prepared[0].id}` : "images/place-placeholder.svg",
      whenLabel: stringField(form, "whenLabel", 240) || dateText,
      sortOrder: (latest._max.sortOrder ?? -1) + 1,
      latitude,
      longitude,
      country: stringField(form, "country", 80) || null,
      province: stringField(form, "province", 80) || null,
      city: stringField(form, "city", 100) || null,
      mapNote: stringField(form, "mapNote", 1200) || null,
    };
    await prisma.$transaction(async tx => {
      await tx.visitedPlace.create({ data });
      if (hasStory) {
        const memoryId = randomUUID();
        await tx.travelMemory.create({ data: { id: memoryId, placeId: id, title: storyTitle || name, content: storyContent, happenedAt: storyDate } });
        await attachStoryPhotos(tx, actor.id, memoryId, prepared);
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "足迹地点", entityId: id, summary: data.name } });
    });
    written.length = 0;
    revalidatePath("/visited");
    revalidatePath("/memories");
    revalidatePath("/admin");
    revalidatePath("/admin/places");
  } catch (error) {
    await removeStoredMediaFiles(written);
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
    const supportedCurrencies = ["CNY", "USD", "EUR", "GBP", "SGD", "JPY", "AUD", "CAD", "HKD", "TWD", "KRW", "THB", "MYR", "IDR", "VND", "PHP", "INR", "NZD", "CHF"];
    if (!supportedCurrencies.includes(currency)) throw new Error("暂不支持该币种");
    if (visibility !== "PUBLIC" && visibility !== "PRIVATE") throw new Error("站点访问模式无效");
    const settings = [
      ["siteName", stringField(form, "siteName", 40, true)],
      ["siteSubtitle", stringField(form, "siteSubtitle", 60)],
      ["primaryMemberName", stringField(form, "primaryMemberName", 30, true)],
      ["secondaryMemberName", stringField(form, "secondaryMemberName", 30, true)],
      ["togetherLabel", stringField(form, "togetherLabel", 40, true)],
      ["currency", currency],
      ["visibility", visibility],
    ] as const;
    await prisma.$transaction(async tx => {
      for (const [key, value] of settings) {
        await tx.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "站点设置", entityId: "site", summary: settings.map(([key, value]) => `${key}=${value}`).join("; ").slice(0, 500) } });
    });
    revalidatePath("/", "layout");
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/login");
  } catch (error) {
    return errorState(error);
  }
  redirect("/admin/settings?saved=1");
}

export async function savePlaceAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  let id: string;
  try {
    id = stringField(form, "id", 64, true);
    const original = await prisma.visitedPlace.findUnique({ where: { id } });
    if (!original) throw new Error("足迹地点不存在");
    const group = stringField(form, "group", 8);
    if (!["both", "her", "mine"].includes(group)) throw new Error("到访归属无效");
    const latitude = optionalCoordinate(form, "latitude", -90, 90);
    const longitude = optionalCoordinate(form, "longitude", -180, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("经纬度必须同时填写");
    const name = stringField(form, "name", 100, true);
    const region = stringField(form, "region", 160, true);
    if ((name !== original.name || region !== original.region) &&
        await prisma.visitedPlace.findFirst({ where: { id: { not: id }, name, region }, select: { id: true } })) {
      throw new Error("另一个足迹地点已使用相同名称和地区");
    }
    const data = {
      group,
      name,
      region,
      whenLabel: stringField(form, "whenLabel", 240),
      country: stringField(form, "country", 80) || null,
      province: stringField(form, "province", 80) || null,
      city: stringField(form, "city", 100) || null,
      latitude,
      longitude,
      mapNote: stringField(form, "mapNote", 1200),
    };
    await prisma.$transaction(async (tx) => {
      await tx.visitedPlace.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "足迹地点", entityId: id, summary: data.name } });
    });
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/places");
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/places/${encodeURIComponent(id)}?saved=1`);
}
