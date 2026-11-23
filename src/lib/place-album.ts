import "server-only";
import type { Prisma } from "@prisma/client";
import { mediaIdFromPath } from "@/lib/media-lifecycle";
import { readAlbumLimits } from "@/lib/place-album-limits";

// 从站点设置读取相册额度，缺省时沿用已有安装的上限。
export async function getPlaceAlbumLimits(db: Prisma.TransactionClient) {
  const rows = await db.appSetting.findMany({ where: { key: { in: ["albumMaxPhotos", "albumMaxMiB"] } } });
  const limits = readAlbumLimits(new Map(rows.map(row => [row.key, row.value])));
  return { maxPhotos: limits.albumMaxPhotos, maxBytes: limits.albumMaxMiB * 1024 ** 2 };
}

// 按整个地点统计照片，兼容只有旧媒体 URL 的照片记录。
export async function getPlaceAlbumUsage(db: Prisma.TransactionClient, placeId: string) {
  const photos = await db.travelPhoto.findMany({
    where: { memory: { placeId } }, select: { mediaAssetId: true, filePath: true },
  });
  const ids = new Set(photos.flatMap(photo => {
    const id = photo.mediaAssetId ?? mediaIdFromPath(photo.filePath);
    return id ? [id] : [];
  }));
  if (!ids.size) return { count: photos.length, bytes: 0 };
  const sizes = await db.mediaAsset.aggregate({ where: { id: { in: [...ids] } }, _sum: { byteSize: true } });
  return { count: photos.length, bytes: sizes._sum.byteSize ?? 0 };
}
