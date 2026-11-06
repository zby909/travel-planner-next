"use client";

import Link from "next/link";
import { useActionState } from "react";
import { currencyFractionDigits } from "@/lib/money";
import { saveTravelExpenseAction, deleteTravelExpenseAction, type ExpenseFormState } from "./expense-actions";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

const INITIAL_STATE: ExpenseFormState = { error: "" };

export type ExpenseInput = { id: string; category: string; amountMinor: number; spentAt: string; description: string };

// 使用同一个表单新增或编辑花费，保留币种精度和明确的取消入口。
export function ExpenseForm({ planId, currency, initial }: { planId: string; currency: string; initial?: ExpenseInput }) {
  const [state, action, pending] = useActionState(saveTravelExpenseAction, INITIAL_STATE);
  const fractionDigits = currencyFractionDigits(currency);
  const step = fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;

  return <form action={action} className="admin-form expense-form">
    <input type="hidden" name="planId" value={planId} />
    <input type="hidden" name="id" value={initial?.id ?? ""} />
    <input type="hidden" name="currency" value={currency} />
    <div className="expense-form-grid">
      <label>费用分类
        <select name="category" defaultValue={initial?.category ?? "FOOD"}>
          {EXPENSE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>金额（{currency}）
        <input name="amount" type="number" inputMode="decimal" min={step} max="1000000" step={step} required defaultValue={initial ? (initial.amountMinor / 10 ** fractionDigits).toFixed(fractionDigits) : ""} placeholder={fractionDigits ? "例如 128.50" : "例如 128"} />
      </label>
      <label>消费日期（可选）
        <input name="spentAt" type="date" defaultValue={initial?.spentAt ?? ""} />
      </label>
      <label>备注（可选）
        <input name="description" maxLength={160} defaultValue={initial?.description ?? ""} placeholder="例如：晚餐 / 市内打车" />
      </label>
    </div>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row">
      {initial ? <Link className="admin-back" href={`/admin/plans/${planId}#plan-expenses`}>取消编辑</Link> : null}
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : initial ? "保存费用修改" : "记录这笔费用"}</button>
    </div>
  </form>;
}

// 删除费用前确认，避免误触移除旅行记录。
export function DeleteExpenseButton() {
  return <button className="admin-text-action" type="submit" onClick={event => {
    if (!window.confirm("确定删除这笔旅行费用吗？删除后会重新计算总支出和预算余额。")) event.preventDefault();
  }}>删除</button>;
}

// 让费用列表中的删除表单调用受权限保护的服务端动作。
export function ExpenseDeleteForm({ id, planId }: { id: string; planId: string }) {
  return <form action={deleteTravelExpenseAction}>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="planId" value={planId} />
    <DeleteExpenseButton />
  </form>;
}
