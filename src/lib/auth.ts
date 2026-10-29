import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, newSessionToken } from "@/lib/security";

const COOKIE_NAME = "travel_session";
const SESSION_DAYS = 7;
export type Editor = { id: string; username: string; displayName: string; role: string };

export async function getCurrentUser(): Promise<Editor | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, username: true, displayName: true, role: true, isActive: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) return null;
  const { id, username, displayName, role } = session.user;
  return { id, username, displayName, role };
}

export async function requireEditor(): Promise<Editor> {
  const user = await getCurrentUser();
  if (!user || !["EDITOR", "ADMIN"].includes(user.role)) redirect("/login");
  return user;
}

export async function createSession(userId: string): Promise<void> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(COOKIE_NAME);
}
