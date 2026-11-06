import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseUnusedMedia } from "@/lib/media-lifecycle";
import { removeStoredMediaFiles } from "@/lib/media-storage";

// 取消本人草稿，并撤销已经没有业务或草稿引用的配图。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await prisma.importDraft.findUnique({ where: { id } });
  const scope = draft?.kind === "visits" || draft?.kind === "visits-update" || draft?.kind === "timeline" ? "visits:write"
    : draft?.kind === "destinations" || draft?.kind === "destinations-update" ? "destinations:write" : null;
  if (!scope) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  const user = await authenticateApi(request, scope);
  if (!user || draft?.ownerId !== user.userId) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.importDraft.updateMany({ where: { id, ownerId: user.userId, status: "PREPARED" }, data: { status: "CANCELED" } });
    const payload = JSON.parse(draft.payloadJson) as { items?: { imageId?: unknown }[] };
    const ids = (payload.items ?? []).flatMap(item => typeof item.imageId === "string" ? [item.imageId] : []);
    return { canceled: changed.count === 1, files: changed.count ? await releaseUnusedMedia(tx, ids) : [] };
  });
  await removeStoredMediaFiles(result.files);
  return NextResponse.json({ canceled: result.canceled }, { headers: { "Cache-Control": "no-store" } });
}
