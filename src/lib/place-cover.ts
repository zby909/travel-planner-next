import "server-only";

import type { Prisma } from "@prisma/client";
import { mediaIdFromPath } from "@/lib/media-lifecycle";
import { visitPhotoOrder } from "@/lib/place-visits";

// 删除故事照片后，若当前封面也在被删照片中，就切换到剩余相册首图。
export async function refreshPlaceCoverAfterRemoval(
  tx: Prisma.TransactionClient, placeId: string, removedMediaIds: string[],
): Promise<void> {
  const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { image: true } });
  const currentId = mediaIdFromPath(place?.image);
  if (!currentId || !removedMediaIds.includes(currentId)) return;
  const photos = await tx.travelPhoto.findMany({
    where: { memory: { placeId, deletedAt: null } },
    orderBy: visitPhotoOrder,
    select: { mediaAssetId: true, filePath: true },
  });
  const nextId = photos.map(photo => photo.mediaAssetId ?? mediaIdFromPath(photo.filePath)).find(Boolean);
  await tx.visitedPlace.update({ where: { id: placeId }, data: {
    image: nextId ? `api/media/${nextId}` : "images/place-placeholder.svg",
    coverX: 50, coverY: 50,
  } });
}
