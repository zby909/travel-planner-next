export const SUPPORTED_CURRENCY_OPTIONS = [
  { code: "CNY", label: "人民币 CNY", fractionDigits: 2 },
  { code: "USD", label: "美元 USD", fractionDigits: 2 },
  { code: "SGD", label: "新加坡元 SGD", fractionDigits: 2 },
  { code: "EUR", label: "欧元 EUR", fractionDigits: 2 },
  { code: "GBP", label: "英镑 GBP", fractionDigits: 2 },
  { code: "JPY", label: "日元 JPY", fractionDigits: 0 },
  { code: "AUD", label: "澳元 AUD", fractionDigits: 2 },
  { code: "CAD", label: "加拿大元 CAD", fractionDigits: 2 },
  { code: "HKD", label: "港币 HKD", fractionDigits: 2 },
  { code: "TWD", label: "新台币 TWD", fractionDigits: 2 },
  { code: "KRW", label: "韩元 KRW", fractionDigits: 0 },
  { code: "THB", label: "泰铢 THB", fractionDigits: 2 },
  { code: "MYR", label: "马来西亚林吉特 MYR", fractionDigits: 2 },
  { code: "IDR", label: "印尼盾 IDR", fractionDigits: 0 },
  { code: "VND", label: "越南盾 VND", fractionDigits: 0 },
  { code: "PHP", label: "菲律宾比索 PHP", fractionDigits: 2 },
  { code: "INR", label: "印度卢比 INR", fractionDigits: 2 },
  { code: "NZD", label: "新西兰元 NZD", fractionDigits: 2 },
  { code: "CHF", label: "瑞士法郎 CHF", fractionDigits: 2 },
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCY_OPTIONS)[number]["code"];

export const SUPPORTED_CURRENCIES: readonly [SupportedCurrency, ...SupportedCurrency[]] = [
  "CNY", "USD", "SGD", "EUR", "GBP", "JPY", "AUD", "CAD", "HKD", "TWD",
  "KRW", "THB", "MYR", "IDR", "VND", "PHP", "INR", "NZD", "CHF",
];

const CURRENCY_FRACTION_DIGITS: Readonly<Record<string, number>> = Object.fromEntries(
  SUPPORTED_CURRENCY_OPTIONS.map(option => [option.code, option.fractionDigits]),
);

// 判断币种代码是否在站点支持的白名单内。
export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return Object.prototype.hasOwnProperty.call(CURRENCY_FRACTION_DIGITS, value);
}

// 使用静态映射获取币种最小单位小数位数，避免不同 Node/浏览器 ICU 版本差异。
export function currencyFractionDigits(currency: string): number {
  return CURRENCY_FRACTION_DIGITS[currency] ?? 2;
}

// 按币种小数位确定单笔支出上限，确保换算为最小单位后始终落在 32 位整型内。
export function maxExpenseMajorAmount(currency: string): number {
  return currencyFractionDigits(currency) === 0 ? 1_000_000_000 : 20_000_000;
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

  const maxMajor = maxExpenseMajorAmount(currency);
  const scale = BigInt(10) ** BigInt(fractionDigits);
  const whole = BigInt(match[1]);
  const decimal = fractionDigits > 0 ? BigInt(fraction.padEnd(fractionDigits, "0") || "0") : BigInt(0);
  const amountMinor = whole * scale + decimal;
  if (amountMinor <= BigInt(0) || amountMinor > BigInt(maxMajor) * scale) {
    throw new Error(`单笔金额必须大于 0，且不能超过 ${maxMajor.toLocaleString("en-US")}`);
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
