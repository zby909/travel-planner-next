import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { visibleMemoryWhere } from "@/lib/content-visibility";

// 仅把本项目的媒体 URL 解析为资源 ID，不接收磁盘路径。
export function mediaIdFromPath(value: string | null | undefined): string | null {
  return value?.match(/^\/?api\/media\/([a-f0-9-]{36})$/i)?.[1] ?? null;
}

// 在引用更新的同一事务内清理资源；归档记录和待确认草稿仍保留所有权。
export async function releaseUnusedMedia(tx: Prisma.TransactionClient, ids: string[]): Promise<string[]> {
  const files: string[] = [];
  const drafts = ids.length ? await tx.importDraft.findMany({
    where: { status: "PREPARED", expiresAt: { gt: new Date() } }, select: { payloadJson: true },
  }) : [];
  const protectedIds = new Set<string>();
  for (const draft of drafts) {
    try {
      const payload = JSON.parse(draft.payloadJson) as { items?: { imageId?: unknown }[] };
      for (const item of payload.items ?? []) if (typeof item.imageId === "string") protectedIds.add(item.imageId);
    } catch { /* 损坏草稿不会授权访问或阻止清理。 */ }
  }
  for (const id of new Set(ids)) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) continue;
    const paths = [`/api/media/${id}`, `api/media/${id}`];
    const references = await Promise.all([
      tx.destination.count({ where: { imagePath: { in: paths } } }),
      tx.visitedPlace.count({ where: { image: { in: paths } } }),
      tx.travelPhoto.count({ where: { OR: [{ mediaAssetId: id }, { filePath: { in: paths } }] } }),
    ]);
    if (references.some(Boolean)) continue;
    if (protectedIds.has(id)) {
      await tx.mediaAsset.updateMany({ where: { id }, data: { status: "STAGED" } });
      continue;
    }
    const asset = await tx.mediaAsset.findUnique({ where: { id } });
    if (!asset) continue;
    await tx.mediaAsset.delete({ where: { id } });
    if (asset.fileName === `${id}.webp`) files.push(asset.fileName);
  }
  return files;
}

// 匿名访问只允许仍被展示中内容引用的资源，归档内容和孤立旧 URL 不再公开。
export async function hasVisibleMediaReference(id: string): Promise<boolean> {
  const paths = [`/api/media/${id}`, `api/media/${id}`];
  const references = await Promise.all([
    prisma.destination.count({ where: { isArchived: false, imagePath: { in: paths } } }),
    prisma.visitedPlace.count({ where: { isArchived: false, image: { in: paths } } }),
    prisma.travelPhoto.count({ where: {
      OR: [{ mediaAssetId: id }, { filePath: { in: paths } }], memory: visibleMemoryWhere,
    } }),
  ]);
  return references.some(Boolean);
}

// 旧版配图也按当前业务引用授权，避免绕过归档直接读取历史照片。
export async function hasVisibleLegacyReference(path: string): Promise<boolean> {
  const paths = [path, `/${path}`, `/api/legacy-media/${path}`];
  const destinationId = path.match(/^images\/([a-z0-9_-]+)-[012]\.jpg$/i)?.[1];
  const references = await Promise.all([
    prisma.visitedPlace.count({ where: { isArchived: false, image: { in: paths } } }),
    prisma.destination.count({ where: { isArchived: false, OR: [
      { imagePath: { in: paths } },
      ...(destinationId ? [{ id: destinationId, imagePath: null }] : []),
    ] } }),
  ]);
  return references.some(Boolean);
}
