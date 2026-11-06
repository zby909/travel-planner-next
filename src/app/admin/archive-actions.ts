"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ArchiveState = { error: string };

// 可逆地归档或恢复内容，不删除照片和已有旅行关联。
export async function setRecordArchiveAction(_state: ArchiveState, form: FormData): Promise<ArchiveState> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const archived = String(form.get("archived") ?? "");
  if (!id || id.length > 64 || !["destination", "place"].includes(kind) || !["true", "false"].includes(archived)) {
    return { error: "归档参数无效，请刷新页面重试" };
  }
  try {
    await prisma.$transaction(async tx => {
      const data = { isArchived: archived === "true" };
      const record = kind === "destination"
        ? await tx.destination.update({ where: { id }, data, select: { title: true } })
        : await tx.visitedPlace.update({ where: { id }, data, select: { name: true } });
      await tx.auditLog.create({ data: {
        actorId: actor.id, action: data.isArchived ? "归档" : "恢复", entity: kind === "destination" ? "目的地" : "足迹地点",
        entityId: id, summary: "title" in record ? record.title : record.name,
      } });
    });
  } catch {
    return { error: "内容已不存在或暂时无法保存，请刷新页面后重试" };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/${kind === "destination" ? "destinations" : "places"}/${encodeURIComponent(id)}`);
}
