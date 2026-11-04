"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type TimelineFormState = { error: string };

// 读取时间轴表单字段并统一执行长度校验。
function field(form: FormData, key: string, maxLength: number, required = false): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > maxLength || (required && !value)) throw new Error(`请检查字段「${key}」`);
  return value;
}

// 将时间轴成员归属限制为站点支持的三种类型。
function groupField(form: FormData): string {
  const group = field(form, "group", 8, true);
  if (!["both", "her", "mine"].includes(group)) throw new Error("请选择有效的旅行归属");
  return group;
}

// 保存时间轴事件，并同步维护它关联的足迹地点。
export async function saveTimelineAction(_state: TimelineFormState, form: FormData): Promise<TimelineFormState> {
  const actor = await requireEditor();
  try {
    const id = field(form, "id", 64);
    const existing = id ? await prisma.timelineEntry.findUnique({ where: { id }, select: { id: true, sortOrder: true } }) : null;
    if (id && !existing) throw new Error("这条时间记录不存在，可能已被删除");

    const yearText = field(form, "year", 4, true);
    if (!/^\d{4}$/.test(yearText)) throw new Error("年份必须填写四位数字");
    const year = Number(yearText);
    if (year < 1900 || year > 2200) throw new Error("年份超出允许范围");
    const date = field(form, "date", 40, true);
    const title = field(form, "title", 120, true);
    const note = field(form, "note", 4000);
    const group = groupField(form);
    const placeIds = [...new Set(form.getAll("placeIds").map(value => String(value).trim()).filter(Boolean))];
    if (placeIds.length > 40) throw new Error("一条时间记录最多关联 40 个地点");
    if (placeIds.length) {
      const matched = await prisma.visitedPlace.count({ where: { id: { in: placeIds } } });
      if (matched !== placeIds.length) throw new Error("部分关联地点已不存在，请刷新页面后重试");
    }

    const latest = existing ? null : await prisma.timelineEntry.aggregate({ where: { year }, _max: { sortOrder: true } });
    const sortOrder = existing?.sortOrder ?? ((latest?._max.sortOrder ?? -1) + 1);
    const entryId = existing?.id ?? randomUUID();
    await prisma.$transaction(async tx => {
      const data = { date, year, title, note, group, sortOrder };
      if (existing) await tx.timelineEntry.update({ where: { id: entryId }, data });
      else await tx.timelineEntry.create({ data: { id: entryId, ...data } });
      await tx.timelinePlace.deleteMany({ where: { timelineEntryId: entryId } });
      for (const [index, placeId] of placeIds.entries()) {
        await tx.timelinePlace.create({ data: { timelineEntryId: entryId, placeId, sortOrder: index } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: existing ? "更新" : "新增", entity: "旅行时间轴", entityId: entryId, summary: title } });
    });
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/timeline");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败，请稍后重试" };
  }
  redirect("/admin/timeline?saved=1");
}

// 删除时间轴事件；关联表会由数据库关系级联清理。
export async function deleteTimelineAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  if (!id || id.length > 64) throw new Error("无效的时间记录编号");
  const entry = await prisma.timelineEntry.findUnique({ where: { id } });
  if (!entry) throw new Error("这条时间记录不存在");
  await prisma.$transaction(async tx => {
    await tx.timelineEntry.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行时间轴", entityId: id, summary: entry.title } });
  });
  revalidatePath("/visited");
  revalidatePath("/admin");
  revalidatePath("/admin/timeline");
  redirect("/admin/timeline?deleted=1");
}
