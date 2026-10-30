"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
function optionalAmount(form: FormData, key: string): number | null {
  return String(form.get(key) ?? "").trim() === "" ? null : amount(form, key);
}
function optionalDate(form: FormData, key: string): Date | null {
  const text = String(form.get(key) ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${key} 日期格式错误`);
  const date = new Date(text + "T12:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`${key} 不是有效日期`);
  return date;
}
function externalUrl(form: FormData, key: string): string | null {
  const raw = stringField(form, key, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${key} 必须是 HTTP 或 HTTPS 地址`);
  }
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
      budgetFlight: amount(form, "budgetFlight"),
      budgetHotel: amount(form, "budgetHotel"),
      budgetGroup: amount(form, "budgetGroup"),
      budgetFood: amount(form, "budgetFood"),
      budgetTickets: amount(form, "budgetTickets"),
      budgetTransport: amount(form, "budgetTransport"),
      budgetOther: amount(form, "budgetOther"),
    };
    const pickBudget = Object.values(budget).reduce((sum, n) => sum + n, 0);
    const minBudget = amount(form, "minBudget");
    const maxBudget = amount(form, "maxBudget");
    if (maxBudget < minBudget) throw new Error("预算上限不能低于下限");
    if (pickBudget < minBudget || pickBudget > maxBudget) throw new Error("预算分项合计必须落在预算区间内");

    const flight = {
      route: stringField(form, "route", 140),
      normalMin: amount(form, "normalMin"),
      normalMax: amount(form, "normalMax"),
      holidayMin: amount(form, "holidayMin"),
      holidayMax: amount(form, "holidayMax"),
      normalSample: stringField(form, "normalSample", 4000),
      holidaySample: stringField(form, "holidaySample", 4000),
    };
    if (flight.normalMin > flight.normalMax || flight.holidayMin > flight.holidayMax) throw new Error("机票价格区间的下限不能超过上限");
    if (!flight.route && [flight.normalMin, flight.normalMax, flight.holidayMin, flight.holidayMax].some(value => value > 0)) throw new Error("填写机票价格时需要同时填写航线");

    const title = stringField(form, "title", 100, true);
    if (title !== existing.title && await prisma.destination.findFirst({ where: { id: { not: id }, title }, select: { id: true } })) {
      throw new Error("另一个目的地已经使用相同名称");
    }
    const kind = stringField(form, "kind", 80);
    const types = listField(form, "types", 12, 40);
    const seasons = listField(form, "seasons", 4, 10);
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
      flightNote: stringField(form, "flightNote", 3000),
      flightSource: externalUrl(form, "flightSource"),
      minBudget,
      maxBudget,
      pickBudget,
      ...budget,
    };
    await prisma.$transaction(async (tx) => {
      await tx.destination.update({ where: { id }, data });
      if (flight.route) {
        await tx.flightPricing.upsert({
          where: { destinationId: id },
          update: flight,
          create: { destinationId: id, ...flight },
        });
      } else {
        await tx.flightPricing.deleteMany({ where: { destinationId: id } });
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
    const spots = listField(form, "spots", 40, 80);
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
      budgetFlight: 0,
      budgetHotel: 0,
      budgetGroup: 0,
      budgetFood: 0,
      budgetTickets: 0,
      budgetTransport: 0,
      budgetOther: 0,
      groupText: "",
      flightNote: "",
      flightSource: null,
      vibe: stringField(form, "vibe", 220),
      reason: stringField(form, "reason", 3000),
      spotsJson: JSON.stringify(spots),
      routeJson: "[]",
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
    id = randomUUID();
    const data = {
      id,
      group,
      name,
      region,
      image: "images/place-placeholder.svg",
      whenLabel: stringField(form, "whenLabel", 240),
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
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "足迹地点", entityId: id, summary: data.name } });
    });
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
    const supportedCurrencies = ["CNY", "USD", "EUR", "GBP", "SGD", "JPY", "AUD", "CAD", "HKD", "TWD", "KRW", "THB", "MYR", "IDR", "VND", "PHP", "INR", "NZD", "CHF"];
    if (!supportedCurrencies.includes(currency)) throw new Error("暂不支持该币种");
    const settings = [
      ["siteName", stringField(form, "siteName", 40, true)],
      ["siteSubtitle", stringField(form, "siteSubtitle", 60)],
      ["primaryMemberName", stringField(form, "primaryMemberName", 30, true)],
      ["secondaryMemberName", stringField(form, "secondaryMemberName", 30, true)],
      ["togetherLabel", stringField(form, "togetherLabel", 40, true)],
      ["currency", currency],
    ] as const;
    await prisma.$transaction(async tx => {
      for (const [key, value] of settings) {
        await tx.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "站点设置", entityId: "site", summary: settings.map(([key, value]) => `${key}=${value}`).join("; ").slice(0, 500) } });
    });
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
  } catch (error) {
    return errorState(error);
  }
  redirect("/admin/settings?saved=1");
}

const SOURCE_TYPES = ["USER_REPORTED", "PUBLIC_REFERENCE", "HISTORICAL", "PLANNING_ESTIMATE"] as const;

export async function createFlightAction(_state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  try {
    const type = stringField(form, "sourceType", 40, true);
    if (!SOURCE_TYPES.includes(type as typeof SOURCE_TYPES[number])) throw new Error("未知的价格证据类型");
    const destinationId = stringField(form, "destinationId", 64);
    if (destinationId && !(await prisma.destination.findUnique({ where: { id: destinationId }, select: { id: true } }))) {
      throw new Error("选择的关联目的地不存在");
    }
    const departureDate = optionalDate(form, "departureDate");
    const returnDate = optionalDate(form, "returnDate");
    if (departureDate && returnDate && returnDate < departureDate) throw new Error("回程日期不能早于去程日期");
    const totalPrice = optionalAmount(form, "totalPrice");
    const pricePerPerson = optionalAmount(form, "pricePerPerson");
    if (totalPrice === null && pricePerPerson === null) throw new Error("请至少填写同行总价或每人价格");
    const bag = stringField(form, "baggageIncluded", 8);
    if (!["", "unknown", "yes", "no"].includes(bag)) throw new Error("行李政策参数无效");
    const flightType = stringField(form, "flightType", 20);
    if (!["", "DIRECT", "TRANSFER", "UNKNOWN"].includes(flightType)) throw new Error("航班类型无效");
    const data = {
      id: randomUUID(),
      route: stringField(form, "route", 200, true),
      origin: stringField(form, "origin", 100, true),
      destinationName: stringField(form, "destinationName", 100, true),
      sourceType: type,
      departureDate,
      returnDate,
      pricePerPerson,
      totalPrice,
      currency: (await prisma.appSetting.findUnique({ where: { key: "currency" }, select: { value: true } }))?.value ?? "CNY",
      sourceName: stringField(form, "sourceName", 120),
      sourceUrl: externalUrl(form, "sourceUrl"),
      checkedAt: optionalDate(form, "checkedAt"),
      airline: stringField(form, "airline", 100),
      flightType: flightType || null,
      baggageIncluded: bag === "unknown" || !bag ? null : bag === "yes",
      baggageDetails: stringField(form, "baggageDetails", 200),
      notes: stringField(form, "notes", 2000),
      destinationId: destinationId || null,
    };
    await prisma.$transaction(async (tx) => {
      const saved = await tx.flightPriceSample.create({ data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "机票报价", entityId: saved.id, summary: data.route } });
    });
    revalidatePath("/admin/flights");
    revalidatePath("/admin");
    revalidatePath("/");
    if (destinationId) revalidatePath(`/destinations/${destinationId}`);
  } catch (error) {
    return errorState(error);
  }
  redirect("/admin/flights?added=1");
}

export async function deleteFlightAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "");
  if (id.length < 1 || id.length > 80) throw new Error("无效报价编号");
  const found = await prisma.flightPriceSample.findUnique({ where: { id } });
  if (!found) throw new Error("报价不存在");
  await prisma.$transaction(async (tx) => {
    await tx.flightPriceSample.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "机票报价", entityId: id, summary: found.route } });
  });
  revalidatePath("/admin/flights");
  revalidatePath("/admin");
  revalidatePath("/");
  if (found.destinationId) revalidatePath(`/destinations/${found.destinationId}`);
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
