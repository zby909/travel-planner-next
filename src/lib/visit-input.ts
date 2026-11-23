import "server-only";
import { VISIT_GROUPS, type VisitGroup } from "@/lib/place-visits";

// 将可选到访日期按 UTC 中午保存，避免跨时区日期错位。
export function optionalVisitDate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效的到访日期");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("到访日期无效");
  return date;
}

// 读取到访表单的有界文本，所有写入入口共用相同的长度约束。
export function visitFormText(form: FormData, key: string, limit: number): string {
  const input = form.get(key);
  if (input === null) return "";
  if (typeof input !== "string" || input.trim().length > limit) throw Error("请检查输入内容的长度");
  return input.trim();
}

// 读取实际提交的并发版本，缺失值或超出 32 位整数范围均拒绝。
export function visitFormRevision(form: FormData, key: string) {
  const value = visitFormText(form, key, 10);
  if (!/^\d+$/.test(value)) throw Error("记录版本无效，请重新打开这次到访");
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision > 2_147_483_647) throw Error("记录版本无效，请重新打开这次到访");
  return revision;
}

// 保存这一次的日期和同行人，允许给历史记录留空。
export function visitFormData(form: FormData) {
  const group = visitFormText(form, "group", 8);
  if (group && !VISIT_GROUPS.includes(group as VisitGroup)) throw Error("请选择有效的同行人");
  return {
    group: (group || null) as VisitGroup | null,
    happenedAt: optionalVisitDate(visitFormText(form, "happenedAt", 10)),
    whenLabel: visitFormText(form, "whenLabel", 240),
    title: visitFormText(form, "title", 150),
    content: visitFormText(form, "content", 20000),
  };
}

// CLI 的精确日期进入日期字段，年月等较粗粒度的输入保留原文。
export function visitDateFromImport(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { happenedAt: optionalVisitDate(value), whenLabel: "" }
    : { happenedAt: null, whenLabel: value };
}
