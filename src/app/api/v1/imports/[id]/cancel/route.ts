import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseUnusedMedia } from "@/lib/media-lifecycle";
import { removeStoredMediaFiles } from "@/lib/media-storage";

// 取消本人草稿，并撤销已经没有业务或草稿引用的配图。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateApi(request);
  if (!user) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[a-z0-9]{12,40}$/i.test(id)) return NextResponse.json({ error: "invalid draft id" }, { status: 400 });
  const draft = await prisma.importDraft.findFirst({ where: { id, ownerId: user.userId } });
  const scope = draft?.kind === "visits" || draft?.kind === "visits-update" || draft?.kind === "timeline" ? "visits:write"
    : draft?.kind === "destinations" || draft?.kind === "destinations-update" ? "destinations:write" : null;
  if (!scope || !draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  if (!user.scopes.includes(scope)) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.importDraft.updateMany({ where: { id, ownerId: user.userId, status: "PREPARED" }, data: { status: "CANCELED" } });
    let ids: string[] = [];
    try {
      const payload = JSON.parse(draft.payloadJson) as { items?: { imageId?: unknown }[] };
      ids = (payload.items ?? []).flatMap(item => typeof item.imageId === "string" ? [item.imageId] : []);
    } catch { /* 损坏草稿仍允许取消，避免阻断清理。 */ }
    return { canceled: changed.count === 1, files: changed.count ? await releaseUnusedMedia(tx, ids) : [] };
  });
  await removeStoredMediaFiles(result.files);
  return NextResponse.json({ canceled: result.canceled }, { headers: { "Cache-Control": "no-store" } });
}
