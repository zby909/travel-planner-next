// 获取币种最小单位的小数位数，例如 JPY 为 0、SGD 为 2。
export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

// 将用户输入的金额精确转换为币种最小单位，避免浮点数累计误差。
export function parseMoneyToMinorUnits(value: string, currency: string): number {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new Error("请输入有效的正数金额");

  const fractionDigits = currencyFractionDigits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > fractionDigits) {
    throw new Error(`当前币种最多支持 ${fractionDigits} 位小数`);
  }

  const scale = BigInt(10) ** BigInt(fractionDigits);
  const whole = BigInt(match[1]);
  const decimal = fractionDigits > 0 ? BigInt(fraction.padEnd(fractionDigits, "0") || "0") : BigInt(0);
  const amountMinor = whole * scale + decimal;
  if (amountMinor <= BigInt(0) || amountMinor > BigInt(1_000_000) * scale) {
    throw new Error("单笔金额必须大于 0，且不能超过 1,000,000");
  }
  const result = Number(amountMinor);
  if (!Number.isSafeInteger(result)) throw new Error("金额超出可记录范围");
  return result;
}

// 按旅行计划的币种精度格式化以最小单位保存的实际支出。
export function formatMinorMoney(amountMinor: number, currency: string): string {
  const fractionDigits = currencyFractionDigits(currency);
  const scale = 10 ** fractionDigits;
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amountMinor / scale);
  } catch {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  }
}
