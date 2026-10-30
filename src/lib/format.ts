export function formatMoney(value: number | null | undefined, currency = "CNY"): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "CNY";
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value ?? 0);
  } catch {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value ?? 0);
  }
}

export function formatCny(value: number | null | undefined): string {
  return formatMoney(value, "CNY");
}

export function parseJsonArray<T = string>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function formatDate(value: Date | null | undefined): string {
  if (!value) return "日期未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(value);
}
