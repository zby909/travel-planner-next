"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor, endSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/security";

export type PasswordState = { error: string };

export async function changePasswordAction(_previous: PasswordState, data: FormData): Promise<PasswordState> {
  const user = await requireEditor();
  const current = String(data.get("currentPassword") ?? "");
  const next = String(data.get("newPassword") ?? "");
  const confirm = String(data.get("confirmPassword") ?? "");

  if (next.length < 12 || next.length > 128 || next !== confirm) {
    return { error: "新密码必须为 12—128 位，且两次输入一致。" };
  }
  if (current === next) return { error: "新密码不能与旧密码相同。" };

  const account = await prisma.user.findUnique({ where: { id: user.id } });
  if (!account?.isActive || !(await verifyPassword(current, account.passwordHash))) {
    return { error: "当前密码不正确。" };
  }

  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Invalidate all existing sessions, including other devices.
    await tx.authSession.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "修改", entity: "个人密码", entityId: user.id, summary: "修改密码并注销所有设备会话" },
    });
  });
  await endSession();
  redirect("/login?changed=1");
}
