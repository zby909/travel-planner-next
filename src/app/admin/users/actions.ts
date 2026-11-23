"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { createPartnerInvite, revokePartnerInvite } from "@/lib/partner-invite";
import { hashPassword } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/admin/actions";

export type PartnerInviteState = { error: string; token: string; expiresAt: string };

// 管理员生成 24 小时一次性邀请链接，让另一半自己设置账号与密码。
export async function createPartnerInviteAction(_previous: PartnerInviteState, form: FormData): Promise<PartnerInviteState> {
  const actor = await requireEditor();
  if (actor.role !== "ADMIN") return { error: "只有管理员可以生成伴侣邀请链接", token: "", expiresAt: "" };
  const suggestedName = String(form.get("suggestedName") ?? "").trim();
  if (suggestedName.length > 80) return { error: "预设昵称过长", token: "", expiresAt: "" };
  try {
    const result = await createPartnerInvite(actor, suggestedName);
    revalidatePath("/admin/users");
    return { error: "", token: result.token, expiresAt: result.expiresAt };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "生成邀请链接失败", token: "", expiresAt: "" };
  }
}

// 撤销尚未使用的伴侣邀请链接。
export async function revokePartnerInviteAction(): Promise<void> {
  const actor = await requireEditor();
  if (actor.role !== "ADMIN") throw new Error("只有管理员可以撤销伴侣邀请");
  await revokePartnerInvite(actor.id);
  revalidatePath("/admin/users");
  redirect("/admin/users?inviteRevoked=1");
}

// 管理员为另一位旅行记录维护者创建独立的私人编辑账号。
export async function createAccountAction(_previous: FormState, form: FormData): Promise<FormState> {
  const actor = await requireEditor();
  if (actor.role !== "ADMIN") return { error: "只有管理员可以创建新账号" };
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "用户名需为3—40位小写字母、数字或 ._-" };
  if (!displayName || displayName.length > 80) return { error: "显示名称不能为空或过长" };
  if (password.length < 12 || password.length > 128 || password !== confirm) return { error: "密码至少12位且两次输入必须一致" };
  if (await prisma.user.findUnique({ where: { username } })) return { error: "该用户名已经存在" };
  const passwordHash = await hashPassword(password);
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (await tx.user.count({ where: { isActive: true } }) >= 2) return false;
      const newUser = await tx.user.create({ data: { username, displayName, passwordHash, role: "EDITOR" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "创建", entity: "编辑账号", entityId: newUser.id, summary: newUser.username } });
      return true;
    });
    if (!created) return { error: "这个私人站点最多设置两个登录账号，你们的账号已经齐全。" };
    revalidatePath("/admin");
    revalidatePath("/admin/users");
  } catch {
    return { error: "创建账号失败，请检查是否已经存在同名账号" };
  }
  redirect("/admin/users?created=1");
}
