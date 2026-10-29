import "server-only";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const API_SCOPES = [
  "visits:read",
  "visits:write",
  "destinations:read",
  "destinations:write",
  "media:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type AllowedIdentity = { userId: string; username: string };
export async function authenticateApi(request: NextRequest, scope?: ApiScope): Promise<AllowedIdentity | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  if (!/^trv_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: tokenDigest(token) },
    include: { user: { select: { id: true, username: true, isActive: true, role: true } } },
  });
  if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()
      || !record.user.isActive || !["ADMIN", "EDITOR"].includes(record.user.role)) return null;
  let scopes: unknown;
  try { scopes = JSON.parse(record.scopesJson); } catch { return null; }
  if (!Array.isArray(scopes) || !scopes.length || (scope && !scopes.includes(scope))) return null;
  await prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return { userId: record.user.id, username: record.user.username };
}
