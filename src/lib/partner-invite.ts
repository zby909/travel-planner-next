import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, newSessionToken } from "@/lib/security";

export const PARTNER_INVITE_KEY = "partner_invite_v1";
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredPartnerInvite = {
  tokenHash: string;
  expiresAt: string;
  createdById: string;
  inviterName: string;
  suggestedName: string;
};

// 安全解析设置表中的邀请记录，损坏或过期时视为无效。
export function parseStoredInvite(raw: string | undefined): StoredPartnerInvite | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredPartnerInvite>;
    if (
      typeof data.tokenHash === "string" &&
      /^[a-f0-9]{64}$/.test(data.tokenHash) &&
      typeof data.expiresAt === "string" &&
      Number.isFinite(Date.parse(data.expiresAt)) &&
      typeof data.createdById === "string" &&
      typeof data.inviterName === "string"
    ) {
      return {
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        createdById: data.createdById,
        inviterName: data.inviterName,
        suggestedName: typeof data.suggestedName === "string" ? data.suggestedName : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// 使用恒定时间比较校验邀请令牌哈希，避免时序侧信道。
export function matchInviteToken(rawToken: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashSessionToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 查询当前是否有生效中的伴侣邀请，不暴露原始令牌。
export async function getPartnerInviteStatus(): Promise<{ active: false } | { active: true; expiresAt: string; suggestedName: string }> {
  const row = await prisma.appSetting.findUnique({ where: { key: PARTNER_INVITE_KEY }, select: { value: true } });
  const invite = parseStoredInvite(row?.value);
  if (!invite || Date.parse(invite.expiresAt) <= Date.now()) {
    if (row) await prisma.appSetting.deleteMany({ where: { key: PARTNER_INVITE_KEY } });
    return { active: false };
  }
  return { active: true, expiresAt: invite.expiresAt, suggestedName: invite.suggestedName };
}

// 管理员生成 24 小时一次性邀请链接（仅保存哈希），若已满两位成员则拒绝。
export async function createPartnerInvite(actor: { id: string; displayName: string }, suggestedName: string) {
  const rawToken = newSessionToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const payload: StoredPartnerInvite = {
    tokenHash: hashSessionToken(rawToken),
    expiresAt,
    createdById: actor.id,
    inviterName: actor.displayName,
    suggestedName: suggestedName.trim().slice(0, 80),
  };
  await prisma.$transaction(async tx => {
    if (await tx.user.count({ where: { isActive: true } }) >= 2) {
      throw new Error("两位成员账号已齐全，无需再生成邀请链接");
    }
    await tx.appSetting.upsert({
      where: { key: PARTNER_INVITE_KEY },
      create: { key: PARTNER_INVITE_KEY, value: JSON.stringify(payload) },
      update: { value: JSON.stringify(payload) },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "创建", entity: "伴侣邀请", entityId: "partner", summary: "生成 24 小时一次性邀请链接" },
    });
  });
  return { token: rawToken, expiresAt };
}

// 撤销当前未使用的伴侣邀请链接。
export async function revokePartnerInvite(actorId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const deleted = await tx.appSetting.deleteMany({ where: { key: PARTNER_INVITE_KEY } });
    if (deleted.count > 0) {
      await tx.auditLog.create({
        data: { actorId, action: "撤销", entity: "伴侣邀请", entityId: "partner", summary: "撤销未使用的伴侣邀请链接" },
      });
    }
  });
}

// 校验邀请页打开时的令牌是否有效且仍有空余成员名额。
export async function inspectPartnerInvite(rawToken: string): Promise<StoredPartnerInvite | null> {
  const [row, activeCount] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: PARTNER_INVITE_KEY }, select: { value: true } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);
  if (activeCount >= 2) return null;
  const invite = parseStoredInvite(row?.value);
  if (!invite || Date.parse(invite.expiresAt) <= Date.now()) return null;
  return matchInviteToken(rawToken, invite.tokenHash) ? invite : null;
}
