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

    const data = {
      title: stringField(form, "title", 100, true),
      subtitle: stringField(form, "subtitle", 160, true),
      kind: stringField(form, "kind", 80),
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
      currency: "CNY",
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
    const data = {
      group,
      name: stringField(form, "name", 100, true),
      region: stringField(form, "region", 160, true),
      whenLabel: stringField(form, "whenLabel", 240),
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
