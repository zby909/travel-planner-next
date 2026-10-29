"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { API_SCOPES, tokenDigest } from "@/lib/api-auth";

export type TokenState = { error: string; token: string };

export async function issueTokenAction(_state: TokenState, form: FormData): Promise<TokenState> {
  const user = await requireEditor();
  const title = String(form.get("title") ?? "").trim();
  const days = Number(form.get("days"));
  const scopes = form.getAll("scopes").filter((x): x is string => typeof x === "string");
  if (!title || title.length > 80 || ![30, 90, 365].includes(days)) {
    return { error: "令牌名称或有效期不正确", token: "" };
  }
  if (scopes.length === 0 || scopes.some(s => !(API_SCOPES as readonly string[]).includes(s))) {
    return { error: "请至少选择一个有效授权范围", token: "" };
  }
  const raw = "trv_" + randomBytes(32).toString("base64url");
  await prisma.$transaction(async tx => {
    const created = await tx.apiToken.create({
      data: {
        userId: user.id, title, tokenHash: tokenDigest(raw),
        scopesJson: JSON.stringify([...new Set(scopes)]),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "创建", entity: "CLI授权", entityId: created.id, summary: title },
    });
  });
  revalidatePath("/admin/tokens");
  return { error: "", token: raw };
}

export async function revokeTokenAction(form: FormData): Promise<void> {
  const user = await requireEditor();
  const id = String(form.get("id") || "");
  const token = await prisma.apiToken.findFirst({ where: { id, userId: user.id } });
  if (!token) throw new Error("令牌不存在或不属于当前用户");
  await prisma.$transaction(async tx => {
    await tx.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "撤销", entity: "CLI授权", entityId: id, summary: token.title },
    });
  });
  revalidatePath("/admin/tokens");
}
