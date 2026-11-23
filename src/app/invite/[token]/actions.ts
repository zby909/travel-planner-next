"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, setSessionCookie } from "@/lib/auth";
import { matchInviteToken, parseStoredInvite, PARTNER_INVITE_KEY } from "@/lib/partner-invite";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";

export type InviteAcceptState = { error: string };

// 接受管理员签发的一次性邀请链接：校验令牌、创建第二位编辑者账号并自动登录。
export async function acceptPartnerInviteAction(_previous: InviteAcceptState, form: FormData): Promise<InviteAcceptState> {
  const rawToken = String(form.get("token") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return { error: "邀请链接无效或已失效" };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "用户名需为 3—40 位小写字母、数字或 ._-" };
  if (!displayName || displayName.length > 80) return { error: "请填写你的显示名称（最长 80 字）" };
  if (password.length < 12 || password.length > 128 || password !== confirm) {
    return { error: "密码至少 12 位、不超过 128 位，且两次输入必须一致" };
  }

  const passwordHash = await hashPassword(password);
  let created: { id: string; passwordHash: string } | null = null;
  try {
    created = await prisma.$transaction(async tx => {
      const row = await tx.appSetting.findUnique({ where: { key: PARTNER_INVITE_KEY }, select: { value: true } });
      const invite = parseStoredInvite(row?.value);
      if (!invite || Date.parse(invite.expiresAt) <= Date.now() || !matchInviteToken(rawToken, invite.tokenHash)) {
        throw new Error("邀请链接已过期或已被使用，请联系管理员重新生成");
      }
      if (await tx.user.count({ where: { isActive: true } }) >= 2) {
        await tx.appSetting.deleteMany({ where: { key: PARTNER_INVITE_KEY } });
        throw new Error("两位成员账号已齐全，邀请已自动失效");
      }
      if (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
        throw new Error("该用户名已被占用，请换一个登录账号");
      }
      const user = await tx.user.create({
        data: { username, displayName, passwordHash, role: "EDITOR", isActive: true },
        select: { id: true, passwordHash: true },
      });
      await tx.appSetting.deleteMany({ where: { key: PARTNER_INVITE_KEY } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "接受邀请", entity: "编辑账号", entityId: user.id, summary: `${displayName}（${username}）通过邀请链接加入` },
      });
      return user;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "加入失败，请稍后重试" };
  }

  const session = await createSession(created.id, created.passwordHash);
  if (!session) redirect("/login");
  await setSessionCookie(session.token, session.expiresAt);
  revalidatePath("/", "layout");
  redirect("/admin?welcome=1");
}
