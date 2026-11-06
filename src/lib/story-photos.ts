import "server-only";

// 将可选到访日期按 UTC 中午保存，避免跨时区日期错位。
export function optionalStoryDate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效的到访日期");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("到访日期无效");
  return date;
}
