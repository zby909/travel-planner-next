import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, newSessionToken } from "@/lib/security";

export const SESSION_COOKIE_NAME = "travel_session";
const SESSION_DAYS = 7;
export type Editor = { id: string; username: string; displayName: string; role: string };

// 同一页面的布局和子页面共用这次请求的账号查询。
export const getCurrentUser = cache(async function getCurrentUser(): Promise<Editor | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { expiresAt: true, user: { select: { id: true, username: true, displayName: true, role: true, isActive: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) return null;
  const { id, username, displayName, role } = session.user;
  return { id, username, displayName, role };
});

export async function requireEditor(): Promise<Editor> {
  const user = await getCurrentUser();
  if (!user || !["EDITOR", "ADMIN"].includes(user.role)) redirect("/login");
  return user;
}

// 签发会话时重新核对密码版本，让改密和登录按事务顺序生效。
export async function createSession(userId: string, passwordHash: string) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, passwordHash, isActive: true, role: { in: ["ADMIN", "EDITOR"] } }, select: { username: true } });
    if (!user) return null;
    const throttle = await tx.loginThrottle.findUnique({ where: { username: user.username } });
    if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) return null;
    await tx.loginThrottle.deleteMany({ where: { username: user.username } });
    await tx.authSession.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } });
    return { token, expiresAt };
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(SESSION_COOKIE_NAME);
}

// 在 Server Action 中统一写入高安全性的登录会话 Cookie。
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

// 仅当数据库完全没有任何用户且未完成过初始化引导时，才允许进入首次配置向导。
export async function needsInitialSetup(): Promise<boolean> {
  const [userCount, marker] = await Promise.all([
    prisma.user.count(),
    prisma.appSetting.findUnique({ where: { key: "admin_bootstrap_v1" }, select: { key: true } }),
  ]);
  return userCount === 0 && !marker;
}
