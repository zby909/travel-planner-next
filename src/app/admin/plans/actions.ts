"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { removeStoredMediaFiles } from "@/lib/media-storage";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";
import { prisma } from "@/lib/prisma";

export type PlanFormState = { error: string };

const CURRENCIES = ["CNY", "USD", "EUR", "GBP", "SGD", "JPY", "AUD", "CAD", "HKD", "TWD", "KRW", "THB", "MYR", "IDR", "VND", "PHP", "INR", "NZD", "CHF"] as const;
const PLAN_STATUSES = ["PLANNED", "BOOKED", "COMPLETED", "CANCELLED"] as const;

// 读取表单文本并统一限制长度与必填项。
function field(form: FormData, key: string, maxLength: number, required = false): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > maxLength || (required && !value)) throw new Error(`请检查字段「${key}」`);
  return value;
}

// 解析可选日期，固定到 UTC 中午以避免不同时区发生日期偏移。
function optionalDate(form: FormData, key: string): Date | null {
  const value = field(form, key, 10);
  if (!value) return null;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw new Error(`${key} 日期格式无效`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${key} 不是有效日期`);
  return date;
}

// 校验外部攻略地址，禁止脚本协议和带有凭证的 URL。
function safeHttpUrl(value: string, label: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} 必须是有效的 HTTP 或 HTTPS 地址`);
  }
}

// 解析旅行计划字段，并验证日期、预算、状态和目的地。
async function planData(form: FormData) {
  const title = field(form, "title", 100, true);
  const destinationId = field(form, "destinationId", 64);
  const startDate = optionalDate(form, "startDate");
  const endDate = optionalDate(form, "endDate");
  if (startDate && endDate && startDate > endDate) throw new Error("结束日期不能早于出发日期");
  const status = field(form, "status", 20, true);
  if (!PLAN_STATUSES.includes(status as typeof PLAN_STATUSES[number])) throw new Error("请选择有效的旅行状态");
  const budgetText = field(form, "plannedBudget", 12);
  const plannedBudget = budgetText ? Number(budgetText) : null;
  if (budgetText && (!/^(0|[1-9][0-9]*)$/.test(budgetText) || !Number.isSafeInteger(plannedBudget) || plannedBudget! > 100_000_000)) {
    throw new Error("预算必须是 0 到 100,000,000 之间的整数");
  }
  const currency = field(form, "currency", 3, true);
  if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) throw new Error("暂不支持该预算币种");
  if (destinationId && !(await prisma.destination.findUnique({ where: { id: destinationId }, select: { id: true } }))) {
    throw new Error("关联的心愿目的地不存在");
  }
  return {
    title,
    destinationId: destinationId || null,
    startDate,
    endDate,
    status,
    plannedBudget,
    currency,
    notes: field(form, "notes", 4000) || null,
  };
}

// 创建一条旅行计划，并写入操作审计。
export async function createTravelPlanAction(_state: PlanFormState, form: FormData): Promise<PlanFormState> {
  const actor = await requireEditor();
  let id = "";
  try {
    const data = await planData(form);
    id = randomUUID();
    await prisma.$transaction(async tx => {
      await tx.travelPlan.create({ data: { id, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "新增", entity: "旅行计划", entityId: id, summary: data.title } });
    });
    revalidatePath("/admin");
    revalidatePath("/admin/plans");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "创建旅行计划失败" };
  }
  redirect(`/admin/plans/${encodeURIComponent(id)}?created=1`);
}

// 更新旅行计划基础资料，不覆盖其每日攻略链接和费用记录。
export async function saveTravelPlanAction(_state: PlanFormState, form: FormData): Promise<PlanFormState> {
  const actor = await requireEditor();
  let id = "";
  try {
    id = field(form, "id", 64, true);
    const data = await planData(form);
    await prisma.$transaction(async tx => {
      const existing = await tx.travelPlan.findUnique({
        where: { id },
        select: { id: true, currency: true, _count: { select: { expenses: true } } },
      });
      if (!existing) throw new Error("旅行计划不存在或已被删除");
      if (existing._count.expenses > 0 && data.currency !== existing.currency) {
        throw new Error("这趟旅行已有费用记录，不能更改币种，以免历史金额被错误换算");
      }
      await tx.travelPlan.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "旅行计划", entityId: id, summary: data.title } });
    });
    revalidatePath("/admin");
    revalidatePath("/admin/plans");
    revalidatePath(`/admin/plans/${id}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存旅行计划失败" };
  }
  redirect(`/admin/plans/${encodeURIComponent(id)}?saved=1`);
}

// 删除旅行计划和花费、攻略；保留已经发生的旅行故事及其照片。
export async function deleteTravelPlanAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  if (!id || id.length > 64) throw new Error("无效的旅行计划编号");
  const fileNames = await prisma.$transaction(async tx => {
    const plan = await tx.travelPlan.findUnique({
      where: { id }, include: { photos: { where: { memoryId: null } } },
    });
    if (!plan) throw new Error("旅行计划不存在");
    const assetIds = plan.photos.flatMap(photo => [photo.mediaAssetId, mediaIdFromPath(photo.filePath)].filter((value): value is string => Boolean(value)));
    await tx.travelPhoto.deleteMany({ where: { planId: id, memoryId: null } });
    // 其它照片和故事由外键 SetNull 解除计划关联，不应因删除计划被销毁。
    await tx.travelPlan.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行计划", entityId: id, summary: plan.title } });
    return releaseUnusedMedia(tx, assetIds);
  });
  await removeStoredMediaFiles(fileNames);
  revalidatePath("/");
  revalidatePath("/memories");
  revalidatePath("/admin");
  revalidatePath("/admin/plans");
  redirect("/admin/plans?deleted=1");
}

// 保存整趟旅行或某一天对应的外部 HTML 攻略链接。
export async function saveTravelGuideLinkAction(_state: PlanFormState, form: FormData): Promise<PlanFormState> {
  const actor = await requireEditor();
  let planId = "";
  let linkId = "";
  try {
    planId = field(form, "planId", 64, true);
    const plan = await prisma.travelPlan.findUnique({ where: { id: planId }, select: { id: true, title: true, startDate: true, endDate: true } });
    if (!plan) throw new Error("关联的旅行计划不存在");
    const id = field(form, "id", 64);
    const existing = id ? await prisma.travelGuideLink.findFirst({ where: { id, planId }, select: { id: true, sortOrder: true } }) : null;
    if (id && !existing) throw new Error("攻略链接不存在或不属于这趟旅行");
    if (!id && await prisma.travelGuideLink.count({ where: { planId } }) >= 40) throw new Error("每趟旅行最多关联 40 份攻略");
    const dayDate = optionalDate(form, "dayDate");
    if (dayDate && plan.startDate && dayDate < plan.startDate) throw new Error("攻略日期不能早于旅行开始日期");
    if (dayDate && plan.endDate && dayDate > plan.endDate) throw new Error("攻略日期不能晚于旅行结束日期");
    const title = field(form, "title", 120, true);
    const url = safeHttpUrl(field(form, "url", 1000, true), "攻略地址");
    const coverImage = safeHttpUrl(field(form, "coverImage", 1000), "封面图片地址");
    const description = field(form, "description", 600) || null;
    const sortText = field(form, "sortOrder", 6);
    const latestOrder = sortText || existing
      ? null
      : await prisma.travelGuideLink.aggregate({ where: { planId }, _max: { sortOrder: true } });
    const sortOrder = sortText ? Number(sortText) : existing
      ? existing.sortOrder
      : (latestOrder?._max.sortOrder ?? -1) + 1;
    if ((sortText && !/^(0|[1-9][0-9]*)$/.test(sortText)) || !Number.isSafeInteger(sortOrder) || sortOrder > 10000) {
      throw new Error("排序值必须是 0 到 10000 之间的整数");
    }
    linkId = existing?.id ?? randomUUID();
    await prisma.$transaction(async tx => {
      const data = { dayDate, title, url: url!, coverImage, description, sortOrder };
      if (existing) await tx.travelGuideLink.update({ where: { id: linkId }, data });
      else await tx.travelGuideLink.create({ data: { id: linkId, planId, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: existing ? "更新" : "新增", entity: "旅行攻略链接", entityId: linkId, summary: `${plan.title} · ${title}` } });
    });
    revalidatePath("/admin");
    revalidatePath("/admin/plans");
    revalidatePath(`/admin/plans/${planId}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存攻略链接失败" };
  }
  redirect(`/admin/plans/${encodeURIComponent(planId)}?guideSaved=1&guideId=${encodeURIComponent(linkId)}`);
}

// 删除一条外部攻略入口，但不触碰 Stack-Nest 上的原始页面。
export async function deleteTravelGuideLinkAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  const planId = String(form.get("planId") ?? "").trim();
  if (!id || id.length > 64 || !planId || planId.length > 64) throw new Error("无效的攻略链接编号");
  const guide = await prisma.travelGuideLink.findFirst({ where: { id, planId }, select: { id: true, title: true, plan: { select: { title: true } } } });
  if (!guide) throw new Error("攻略链接不存在");
  await prisma.$transaction(async tx => {
    await tx.travelGuideLink.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行攻略链接", entityId: id, summary: `${guide.plan.title} · ${guide.title}` } });
  });
  revalidatePath("/admin");
  revalidatePath("/admin/plans");
  revalidatePath(`/admin/plans/${planId}`);
  redirect(`/admin/plans/${encodeURIComponent(planId)}?guideDeleted=1`);
}
