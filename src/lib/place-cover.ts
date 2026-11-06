import "server-only";

import type { Prisma } from "@prisma/client";
import { mediaIdFromPath } from "@/lib/media-lifecycle";

// 删除故事照片后，若当前封面也在被删照片中，就切换到剩余相册首图。
export async function refreshPlaceCoverAfterRemoval(
  tx: Prisma.TransactionClient, placeId: string, removedMediaIds: string[],
): Promise<void> {
  const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { image: true } });
  const currentId = mediaIdFromPath(place?.image);
  if (!currentId || !removedMediaIds.includes(currentId)) return;
  const nextPhoto = await tx.travelPhoto.findFirst({
    where: { memory: { placeId }, mediaAssetId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { sortOrder: "asc" }],
    select: { mediaAssetId: true },
  });
  await tx.visitedPlace.update({ where: { id: placeId }, data: {
    image: nextPhoto?.mediaAssetId ? `api/media/${nextPhoto.mediaAssetId}` : "images/place-placeholder.svg",
  } });
}
