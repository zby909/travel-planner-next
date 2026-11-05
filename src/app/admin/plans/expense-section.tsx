import { formatDate, formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORIES, getExpenseCategoryLabel } from "@/lib/expenses";
import { currencyFractionDigits, formatMinorMoney } from "@/lib/money";
import { ExpenseDeleteForm, ExpenseForm } from "./expense-form";

type ExpenseItem = {
  id: string;
  category: string;
  amountMinor: number;
  description: string;
  spentAt: Date | null;
};

type Props = {
  planId: string;
  currency: string;
  plannedBudget: number | null;
  expenses: ExpenseItem[];
  saved: boolean;
  deleted: boolean;
};

// 展示单趟旅行的四类主要花费、预算余额和简要明细。
export function TravelExpenseSection({ planId, currency, plannedBudget, expenses, saved, deleted }: Props) {
  const totalMinor = expenses.reduce((sum, item) => sum + item.amountMinor, 0);
  const scale = 10 ** currencyFractionDigits(currency);
  const budgetMinor = plannedBudget === null ? null : plannedBudget * scale;
  const remainingMinor = budgetMinor === null ? null : budgetMinor - totalMinor;
  const categoryTotals = EXPENSE_CATEGORIES.map(category => ({
    value: category.value,
    total: expenses.filter(item => item.category === category.value).reduce((sum, item) => sum + item.amountMinor, 0),
  }));

  return <section className="admin-panel plan-expenses-section" id="plan-expenses">
    <div className="timeline-editor-heading">
      <div>
        <p className="eyebrow">TRIP COSTS</p>
        <h2>旅行花费</h2>
        <p className="muted-copy">按餐饮、住宿、交通和其它简单归类即可，不必逐笔精细记账。</p>
      </div>
      <span className="admin-panel-count">{expenses.length} 笔</span>
    </div>
    {saved ? <p className="form-success" role="status">这笔费用已记录，旅行支出已重新汇总。</p> : null}
    {deleted ? <p className="form-success" role="status">费用记录已删除，旅行支出已重新汇总。</p> : null}

    <div className="expense-overview">
      <div className="expense-overview-total">
        <span>实际支出</span>
        <strong>{formatMinorMoney(totalMinor, currency)}</strong>
      </div>
      <div>
        <span>计划预算</span>
        <strong>{plannedBudget === null ? "未设置" : formatMoney(plannedBudget, currency)}</strong>
      </div>
      <div>
        <span>{remainingMinor === null ? "预算余额" : remainingMinor < 0 ? "超出预算" : "预算剩余"}</span>
        <strong className={remainingMinor !== null && remainingMinor < 0 ? "expense-overrun" : ""}>
          {remainingMinor === null ? "—" : formatMinorMoney(Math.abs(remainingMinor), currency)}
        </strong>
      </div>
    </div>

    <div className="expense-category-grid">
      {categoryTotals.map(category => (
        <div className="expense-category-card" key={category.value}>
          <span>{getExpenseCategoryLabel(category.value)}</span>
          <strong>{formatMinorMoney(category.total, currency)}</strong>
        </div>
      ))}
    </div>

    <div className="expense-add-heading"><h3>记录一笔花费</h3><span>金额按 {currency} 录入</span></div>
    <ExpenseForm planId={planId} currency={currency} />

    <div className="expense-records">
      <div className="expense-add-heading"><h3>花费明细</h3><span>按消费日期排列</span></div>
      {expenses.length ? <div className="expense-record-list">
        {expenses.map(item => {
          const categoryLabel = getExpenseCategoryLabel(item.category);
          return <article className="expense-record" key={item.id}>
            <div className="expense-record-main">
              <strong>{categoryLabel}</strong>
              <span>{item.spentAt ? formatDate(item.spentAt) : "日期未记录"}</span>
              {item.description !== categoryLabel ? <p>{item.description}</p> : null}
            </div>
            <div className="expense-record-side">
              <b>{formatMinorMoney(item.amountMinor, currency)}</b>
              <ExpenseDeleteForm id={item.id} planId={planId} />
            </div>
          </article>;
        })}
      </div> : <p className="expense-empty">还没有花费记录。旅行开始后，简单记下吃、住、行和其它几类即可。</p>}
    </div>
  </section>;
}
