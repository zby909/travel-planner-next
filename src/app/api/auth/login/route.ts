import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function loginError(request: NextRequest, code: string) {
  // Origin was validated by the POST handler. Use it as the public host,
  // not request.url, which may be the internal Next.js server address.
  const url = new URL("/login", request.headers.get("origin") || request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  // Strict same-origin check: Route Handlers do not get the Server Action
  // Origin/Host CSRF verification automatically.
  const origin = request.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin && origin !== "null" ? new URL(origin).host : null;
  } catch {
    return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
  }
  const host = request.headers.get("host");
  const allowedOrigin = process.env.APP_ORIGIN?.trim();
  if (!originHost || (originHost !== host && (!allowedOrigin || origin !== allowedOrigin))) {
    return NextResponse.json({ error: "跨站请求已拒绝" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "不支持的表单格式" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "无效的表单" }, { status: 400 });
  }
  const rawName = form.get("username");
  const rawPassword = form.get("password");
  const username = typeof rawName === "string" ? rawName.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 1 || password.length > 128) {
    return loginError(request, "1");
  }
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { username } });
  if (throttle?.lockedUntil && throttle.lockedUntil > now) return loginError(request, "locked");

  const user = await prisma.user.findUnique({ where: { username } });
  const matched = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.isActive || !matched) {
    const failures = throttle && now.getTime() - throttle.updatedAt.getTime() < 15 * 60 * 1000
      ? throttle.failures + 1 : 1;
    await prisma.loginThrottle.upsert({
      where: { username },
      create: { username, failures, lockedUntil: failures >= 5 ? new Date(now.getTime() + 900000) : null },
      update: { failures, lockedUntil: failures >= 5 ? new Date(now.getTime() + 900000) : null },
    });
    return loginError(request, "1");
  }
  await prisma.loginThrottle.deleteMany({ where: { username } });
  await createSession(user.id);
  return NextResponse.redirect(new URL("/admin", origin || request.url), { status: 303 });
}
