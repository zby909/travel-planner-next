"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, setSessionCookie } from "@/lib/auth";
import { isSupportedCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";

export type SetupState = { error: string };

// 空白实例首次访问的原子化初始化：创建首位管理员、保存空间设置并自动登录。
export async function completeInitialSetupAction(_previous: SetupState, form: FormData): Promise<SetupState> {
  const siteName = String(form.get("siteName") ?? "").trim() || "我们的旅行手记";
  const primaryMemberName = String(form.get("primaryMemberName") ?? "").trim() || "我";
  const secondaryMemberName = String(form.get("secondaryMemberName") ?? "").trim() || "TA";
  const visibility = String(form.get("visibility") ?? "PRIVATE").trim();
  const currency = String(form.get("currency") ?? "CNY").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (siteName.length > 40) return { error: "空间名称不能超过 40 字" };
  if (primaryMemberName.length > 30 || secondaryMemberName.length > 30) return { error: "成员昵称不能超过 30 字" };
  if (visibility !== "PRIVATE" && visibility !== "PUBLIC") return { error: "请选择有效的空间可见性" };
  if (!isSupportedCurrency(currency)) return { error: "请选择有效的默认币种" };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "登录账号需为 3—40 位小写字母、数字或 ._-" };
  if (password.length < 12 || password.length > 128 || password !== confirm) {
    return { error: "密码至少 12 位、不超过 128 位，且两次输入必须一致" };
  }

  const passwordHash = await hashPassword(password);
  let createdUser: { id: string; passwordHash: string } | null = null;
  try {
    createdUser = await prisma.$transaction(async tx => {
      const [userCount, marker] = await Promise.all([
        tx.user.count(),
        tx.appSetting.findUnique({ where: { key: "admin_bootstrap_v1" }, select: { key: true } }),
      ]);
      if (userCount > 0 || marker) return null;

      const admin = await tx.user.create({
        data: { username, displayName: primaryMemberName, passwordHash, role: "ADMIN", isActive: true },
        select: { id: true, passwordHash: true },
      });
      const settings: Array<[string, string]> = [
        ["siteName", siteName],
        ["siteSubtitle", "OUR TRAVEL JOURNAL"],
        ["primaryMemberName", primaryMemberName],
        ["secondaryMemberName", secondaryMemberName],
        ["togetherLabel", "我们一起去过"],
        ["visibility", visibility],
        ["currency", currency],
        ["admin_bootstrap_v1", "completed"],
      ];
      for (const [key, value] of settings) {
        await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "初始化", entity: "旅行空间", entityId: "site", summary: `完成首次空间布置（${visibility === "PRIVATE" ? "仅成员可见" : "公开展示"}）` },
      });
      return admin;
    });
  } catch {
    return { error: "初始化未能完成，请刷新页面后重试" };
  }

  if (!createdUser) {
    redirect("/login");
  }

  const session = await createSession(createdUser.id, createdUser.passwordHash);
  if (!session) redirect("/login");
  await setSessionCookie(session.token, session.expiresAt);
  revalidatePath("/", "layout");
  redirect("/admin?welcome=1");
}
