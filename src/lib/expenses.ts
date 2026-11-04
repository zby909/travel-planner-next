export const EXPENSE_CATEGORIES = [
  { value: "FLIGHT", label: "机票" },
  { value: "HOTEL", label: "酒店" },
  { value: "FOOD", label: "吃喝" },
  { value: "OTHER", label: "其它" },
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]["value"];

// 返回固定费用分类对应的中文名称。
export function getExpenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORIES.find(item => item.value === category)?.label ?? "其它";
}
