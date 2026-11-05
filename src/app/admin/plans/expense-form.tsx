"use client";

import { useActionState } from "react";
import { currencyFractionDigits } from "@/lib/money";
import { addTravelExpenseAction, deleteTravelExpenseAction, type ExpenseFormState } from "./expense-actions";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

const INITIAL_STATE: ExpenseFormState = { error: "" };

// 为当前旅行快速新增一笔四类花费之一。
export function ExpenseForm({ planId, currency }: { planId: string; currency: string }) {
  const [state, action, pending] = useActionState(addTravelExpenseAction, INITIAL_STATE);
  const fractionDigits = currencyFractionDigits(currency);
  const step = fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;

  return <form action={action} className="admin-form expense-form">
    <input type="hidden" name="planId" value={planId} />
    <div className="expense-form-grid">
      <label>费用分类
        <select name="category" defaultValue="FOOD">
          {EXPENSE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>金额（{currency}）
        <input name="amount" type="number" inputMode="decimal" min={step} max="1000000" step={step} required placeholder={fractionDigits ? "例如 128.50" : "例如 128"} />
      </label>
      <label>消费日期（可选）
        <input name="spentAt" type="date" />
      </label>
      <label>备注（可选）
        <input name="description" maxLength={160} placeholder="例如：晚餐 / 市内打车" />
      </label>
    </div>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row">
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "记录中…" : "记录这笔费用"}</button>
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
