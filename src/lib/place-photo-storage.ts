import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getUploadDirectory } from "@/lib/media-storage";

export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PLACE_PHOTOS = 120;

// 校验图片格式并压缩为 WebP，重编码默认删除 GPS/EXIF 等元数据。
async function compressPhoto(file: File): Promise<Buffer> {
  if (file.size < 20 || file.size > PHOTO_MAX_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw Error("仅支持 JPG、PNG、WebP，单张照片不能超过 20 MiB");
  }
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000, failOn: "error",
    });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw Error();
    return image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    throw Error("图片无法处理，请选择非动态 JPG、PNG 或 WebP 文件");
  }
}

// 校验上传请求是否已经成功入库，弱网重试时不重复添加照片。
async function existingPlacePhoto(photoId: string, placeId: string, ownerId: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: photoId }, select: { ownerId: true } });
  if (!asset) return false;
  if (asset.ownerId !== ownerId || !await prisma.travelPhoto.findFirst({
    where: { mediaAssetId: photoId, memory: { placeId } }, select: { id: true },
  })) throw Error("照片请求编号已被使用");
  return true;
}

// 每张照片作为单独请求保存，失败重试复用同一请求编号而不重新创建照片。
export async function uploadPlacePhoto(placeId: string, ownerId: string, file: File, photoId: string) {
  if (!placeId || placeId.length > 64) throw Error("地点参数无效");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(photoId))
    throw Error("照片请求编号无效");
  if (await existingPlacePhoto(photoId, placeId, ownerId)) return { photoId };
  const compressed = await compressPhoto(file);
  const fileName = `${photoId}.webp`;
  const directory = getUploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fileName), compressed, { flag: "wx" });
  try {
    await prisma.$transaction(async tx => {
      const place = await tx.visitedPlace.findUnique({
        where: { id: placeId }, select: { id: true, name: true, image: true },
      });
      if (!place) throw Error("地点不存在");
      let note = await tx.travelMemory.findUnique({ where: { placeId }, select: { id: true } });
      if (!note) {
        note = await tx.travelMemory.create({
          data: { placeId, title: place.name, content: "" }, select: { id: true },
        });
      }
      const count = await tx.travelPhoto.count({ where: { memoryId: note.id } });
      if (count >= MAX_PLACE_PHOTOS) throw Error(`每个地点最多保留 ${MAX_PLACE_PHOTOS} 张照片`);
      await tx.mediaAsset.create({
        data: { id: photoId, ownerId, fileName, mimeType: "image/webp",
          byteSize: compressed.length, status: "PUBLIC" },
      });
      await tx.travelPhoto.create({
        data: { id: randomUUID(), memoryId: note.id, mediaAssetId: photoId,
          filePath: `/api/media/${photoId}`, sortOrder: count },
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
    await unlink(join(directory, fileName)).catch(() => {});
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/visited");
  revalidatePath("/memories");
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${placeId}`);
  return { photoId };
}
