import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { verifyPassword } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { safeInternalPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

// 登录失败时保留站内返回地址，避免访客需要重新寻找原页面。
function loginError(request: NextRequest, code: string, nextPath: string) {
  // Origin was validated by the POST handler. Use it as the public host,
  // not request.url, which may be the internal Next.js server address.
  const url = new URL("/login", request.headers.get("origin") || request.url);
  url.searchParams.set("error", code);
  if (nextPath !== "/admin") url.searchParams.set("next", nextPath);
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
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  const allowedOrigin = process.env.APP_ORIGIN?.trim();
  if (!originHost || (originHost !== host && (!allowedOrigin || origin !== allowedOrigin))) {
    return NextResponse.json({ error: "跨站请求已拒绝" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "不支持的表单格式" }, { status: 415 });
  }
  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader !== null) {
    const declared = Number(declaredHeader);
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > 4096) {
      return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
    }
  }
  let form: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "无效的表单" }, { status: 400 });
    const parts: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
      }
      parts.push(Buffer.from(value));
    }
    form = await new Response(new Uint8Array(Buffer.concat(parts, total)), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    return NextResponse.json({ error: "无效的表单" }, { status: 400 });
  }
  const rawName = form.get("username");
  const rawPassword = form.get("password");
  const username = typeof rawName === "string" ? rawName.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const nextPath = safeInternalPath(form.get("next"));
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 1 || password.length > 128) {
    return loginError(request, "1", nextPath);
  }
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { username } });
  if (throttle?.lockedUntil && throttle.lockedUntil > now) return loginError(request, "locked", nextPath);

  const user = await prisma.user.findUnique({ where: { username } });
  const matched = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.isActive || !matched) {
    await prisma.$transaction(async tx => {
      const time = new Date();
      const windowMs = 15 * 60 * 1000;
      await tx.loginThrottle.deleteMany({ where: { username, OR: [
        { lockedUntil: { lte: time } }, { lockedUntil: null, updatedAt: { lte: new Date(time.getTime() - windowMs) } },
      ] } });
      const attempt = await tx.loginThrottle.upsert({ where: { username },
        create: { username, failures: 1 }, update: { failures: { increment: 1 } } });
      if (attempt.failures >= 5 && !attempt.lockedUntil) {
        await tx.loginThrottle.update({ where: { username }, data: { lockedUntil: new Date(time.getTime() + windowMs) } });
      }
    });
    return loginError(request, "1", nextPath);
  }
  const session = await createSession(user.id, user.passwordHash);
  if (!session) return loginError(request, "1", nextPath);
  const response = NextResponse.redirect(new URL(nextPath, origin || request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: session.expiresAt,
  });
  return response;
}
