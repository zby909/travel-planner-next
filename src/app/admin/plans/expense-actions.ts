"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { EXPENSE_CATEGORIES, getExpenseCategoryLabel } from "@/lib/expenses";
import { formatMinorMoney, parseMoneyToMinorUnits } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export type ExpenseFormState = { error: string };

// 读取并限制记账表单中的文本字段。
function expenseField(form: FormData, key: string, maxLength: number, required = false): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > maxLength || (required && !value)) throw new Error("请检查费用记录中的必填内容");
  return value;
}

// 解析可选消费日期，固定到 UTC 中午避免跨时区日期偏移。
function expenseDate(value: string): Date | null {
  if (!value) return null;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw new Error("消费日期格式无效");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("消费日期不是有效日期");
  return date;
}

// 新增或编辑旅行花费，金额和记录归属都在事务内校验。
export async function saveTravelExpenseAction(_state: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  const actor = await requireEditor();
  let planId = "";
  try {
    planId = expenseField(form, "planId", 64, true);
    const plan = await prisma.travelPlan.findUnique({
      where: { id: planId },
      select: { id: true, title: true, currency: true },
    });
    if (!plan) throw new Error("旅行计划不存在或已被删除");

    const category = expenseField(form, "category", 20, true);
    if (!EXPENSE_CATEGORIES.some(item => item.value === category)) throw new Error("请选择餐饮、住宿、交通或其它分类");
    const amountMinor = parseMoneyToMinorUnits(expenseField(form, "amount", 24, true), plan.currency);
    const spentAt = expenseDate(expenseField(form, "spentAt", 10));
    const note = expenseField(form, "description", 160);
    const requestedId = expenseField(form, "id", 64);
    const id = requestedId || randomUUID();
    const currency = expenseField(form, "currency", 3, true);
    if (currency !== plan.currency) throw new Error("旅行币种已变化，请刷新后重新记录");
    const categoryLabel = getExpenseCategoryLabel(category);

    await prisma.$transaction(async tx => {
      const currentPlan = await tx.travelPlan.findUnique({
        where: { id: planId },
        select: { title: true, currency: true },
      });
      if (!currentPlan || currentPlan.currency !== plan.currency) {
        throw new Error("旅行计划币种已变化，请刷新页面后重新记录");
      }
      const data = { category, amountMinor, description: note || categoryLabel, spentAt };
      if (requestedId) {
        const result = await tx.expense.updateMany({ where: { id, planId }, data });
        if (result.count !== 1) throw new Error("费用记录不存在或不属于这趟旅行，请刷新页面");
      } else {
        await tx.expense.create({ data: { id, planId, ...data } });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: requestedId ? "更新" : "新增",
          entity: "旅行费用",
          entityId: id,
          summary: `${currentPlan.title} · ${categoryLabel} · ${formatMinorMoney(amountMinor, currentPlan.currency)}`,
        },
      });
    });
    revalidatePath("/admin/plans");
    revalidatePath(`/admin/plans/${planId}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存旅行费用失败" };
  }
  redirect(`/admin/plans/${encodeURIComponent(planId)}?expenseSaved=1`);
}

// 删除指定旅行中的一笔费用，并保留操作审计。
export async function deleteTravelExpenseAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  const planId = String(form.get("planId") ?? "").trim();
  if (!id || id.length > 64 || !planId || planId.length > 64) throw new Error("无效的费用记录编号");

  const expense = await prisma.expense.findFirst({
    where: { id, planId },
    select: {
      id: true,
      category: true,
      amountMinor: true,
      plan: { select: { title: true, currency: true } },
    },
  });
  if (!expense) throw new Error("费用记录不存在或不属于这趟旅行");

  await prisma.$transaction(async tx => {
    await tx.expense.delete({ where: { id: expense.id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "删除",
        entity: "旅行费用",
        entityId: expense.id,
        summary: `${expense.plan.title} · ${getExpenseCategoryLabel(expense.category)} · ${formatMinorMoney(expense.amountMinor, expense.plan.currency)}`,
      },
    });
  });
  revalidatePath("/admin/plans");
  revalidatePath(`/admin/plans/${planId}`);
  redirect(`/admin/plans/${encodeURIComponent(planId)}?expenseDeleted=1`);
}
