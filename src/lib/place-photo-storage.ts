import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getUploadDirectory } from "@/lib/media-storage";
import { getPlaceAlbumLimits, getPlaceAlbumUsage } from "@/lib/place-album";
import { PHOTO_MAX_BYTES } from "@/lib/place-album-limits";

// 校验图片格式并压缩为 WebP，支持 JPG/PNG/WebP/AVIF，重编码默认删除 GPS/EXIF 元数据。
async function compressPhoto(file: File) {
  if (file.size < 20 || file.size > PHOTO_MAX_BYTES ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
    throw Error("仅支持 JPG、PNG、WebP、AVIF，单张照片不能超过 20 MiB");
  }
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000, failOn: "error",
    });
    const meta = await image.metadata();
    const isAvif = meta.format === "heif" && meta.compression === "av1";
    if ((!["jpeg", "png", "webp"].includes(meta.format ?? "") && !isAvif) || (meta.pages ?? 1) !== 1) throw Error();
    return image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw Error("图片无法处理，请选择非动态 JPG、PNG、WebP 或 AVIF 文件");
  }
}

// 校验上传请求是否已经成功入库，弱网重试时不重复添加照片。
async function existingPlacePhoto(photoId: string, placeId: string, visitId: string, ownerId: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: photoId }, select: { ownerId: true, travelPhoto: { select: { memory: { select: { id: true, placeId: true, deletedAt: true } } } } },
  });
  if (!asset) return false;
  const visit = asset.travelPhoto?.memory;
  if (asset.ownerId !== ownerId || visit?.id !== visitId || visit.placeId !== placeId) throw Error("照片请求编号已被使用");
  if (visit.deletedAt) throw Error("到访已移入回收站");
  return true;
}

// 保存到指定的一次到访，重试沿用请求编号，地点总额在写事务内核对。
export async function uploadPlacePhoto(placeId: string, visitId: string, ownerId: string, file: File, photoId: string) {
  if (!placeId || placeId.length > 64 || !visitId || visitId.length > 64) throw Error("请选择有效的地点与到访记录");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(photoId))
    throw Error("照片请求编号无效");
  if (await existingPlacePhoto(photoId, placeId, visitId, ownerId)) return { photoId };
  const { data: compressed, info } = await compressPhoto(file);
  const fileName = `${photoId}.webp`;
  const directory = getUploadDirectory();
  await mkdir(directory, { recursive: true });
  const target = join(directory, fileName);
  try {
    await writeFile(target, compressed, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      if (await existingPlacePhoto(photoId, placeId, visitId, ownerId)) return { photoId };
      throw Error("这张照片正在处理，请稍后重试");
    }
    throw error;
  }
  try {
    await prisma.$transaction(async tx => {
      // 先取得 SQLite 写锁，让两个成员同时上传时也按同一份剩余容量判断。
      const locked = await tx.travelMemory.updateMany({
        where: { id: visitId, placeId, deletedAt: null }, data: { albumRevision: { increment: 1 } },
      });
      if (!locked.count) throw Error("到访记录不存在或已移入回收站");
      const place = await tx.visitedPlace.findUniqueOrThrow({
        where: { id: placeId }, select: { id: true, name: true, image: true },
      });
      const usage = await getPlaceAlbumUsage(tx, placeId);
      const limits = await getPlaceAlbumLimits(tx);
      if (usage.count >= limits.maxPhotos) throw Error(`每个地点最多保留 ${limits.maxPhotos} 张照片`);
      if (usage.bytes + compressed.length > limits.maxBytes) {
        throw Error(`这个地点的相册将超过 ${limits.maxBytes / 1024 ** 2} MiB，请移除部分照片再上传`);
      }
      const { _max } = await tx.travelPhoto.aggregate({ where: { memoryId: visitId }, _max: { sortOrder: true } });
      await tx.mediaAsset.create({
        data: { id: photoId, ownerId, fileName, mimeType: "image/webp",
          byteSize: compressed.length, width: info.width, height: info.height, status: "PUBLIC" },
      });
      await tx.travelPhoto.create({
        data: { id: randomUUID(), memoryId: visitId, mediaAssetId: photoId,
          filePath: `/api/media/${photoId}`, sortOrder: (_max.sortOrder ?? -1) + 1 },
      });
      if (place.image.includes("placeholder")) {
        await tx.visitedPlace.update({ where: { id: placeId },
          data: { image: `api/media/${photoId}` } });
      }
      await tx.auditLog.create({
        data: { actorId: ownerId, action: "上传", entity: "足迹照片", entityId: photoId, summary: place.name },
      });
    });
  } catch (error) {
    await unlink(target).catch(() => {});
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/visited");
  revalidatePath(`/visited/${placeId}`);
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${placeId}`);
  return { photoId };
}
