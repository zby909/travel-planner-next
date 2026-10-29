"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { hashPassword } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/admin/actions";

export async function createAccountAction(_previous: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  if (actor.role !== "ADMIN") return { error: "只有管理员可以创建新账号" };
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "用户名需为3—40位小写字母、数字或 ._- " };
  if (!displayName || displayName.length > 80) return { error: "显示名称不能为空或过长" };
  if (password.length < 12 || password.length > 128 || password !== confirm) return { error: "密码至少12位且两次输入必须一致" };
  if (await prisma.user.findUnique({ where: { username } })) return { error: "该用户名已经存在" };
  const passwordHash = await hashPassword(password);
  try {
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({ data: { username, displayName, passwordHash, role: "EDITOR" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "创建", entity: "编辑账号", entityId: newUser.id, summary: newUser.username } });
    });
    revalidatePath("/admin/users");
  } catch {
    return { error: "创建账号失败，请检查是否已经存在同名账号" };
  }
  redirect("/admin/users?created=1");
}
