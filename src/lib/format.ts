export function formatMoney(value: number | null | undefined, currency = "CNY"): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "CNY";
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value ?? 0);
  } catch {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value ?? 0);
  }
}

// 旧库可能包含损坏的文本数组，保留其中仍可显示和编辑的文字。
export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

export function formatDate(value: Date | null | undefined): string {
  return value ? dateFormat.format(value) : "日期未记录";
}
