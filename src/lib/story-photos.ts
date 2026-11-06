import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import { getUploadDirectory, removeStoredMediaFiles } from "@/lib/media-storage";

const MAX_BATCH_BYTES = 8 * 1024 * 1024;
export const MAX_STORY_PHOTOS = 12;

export type PreparedStoryPhoto = { id: string; fileName: string; bytes: Buffer };

// 将用户照片批量校验、去 EXIF 并转为 WebP；任何失败都清理已写文件。
export async function prepareStoryPhotos(form: FormData): Promise<PreparedStoryPhoto[]> {
  const values = form.getAll("photos");
  if (values.some(value => !(value instanceof File))) throw new Error("照片上传内容无效");
  const photos = values.filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > 8 || photos.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error("单次最多选择 8 张照片、合计不超过 8 MiB");
  }
  const prepared: PreparedStoryPhoto[] = [];
  try {
    for (const file of photos) {
      if (file.size < 20 || file.size > MAX_BATCH_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("只支持不超过 8 MiB 的 JPG、PNG、WebP 照片");
      }
      let bytes: Buffer;
      try {
        const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: "error" });
        const metadata = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error();
        bytes = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 }).toBuffer();
      } catch {
        throw new Error("照片无法处理，请改用静态 JPG、PNG 或 WebP");
      }
      const id = randomUUID();
      const fileName = `${id}.webp`;
      await mkdir(getUploadDirectory(), { recursive: true });
      await writeFile(join(getUploadDirectory(), fileName), bytes, { flag: "wx" });
      prepared.push({ id, fileName, bytes });
    }
    return prepared;
  } catch (error) {
    await removeStoredMediaFiles(prepared.map(photo => photo.fileName));
    throw error;
  }
}

// 在同一数据库事务内记录照片资源与故事关联，支持新建地点时自动选首图作为封面。
export async function attachStoryPhotos(tx: Prisma.TransactionClient, ownerId: string, memoryId: string, prepared: PreparedStoryPhoto[]) {
  const count = await tx.travelPhoto.count({ where: { memoryId } });
  if (count + prepared.length > MAX_STORY_PHOTOS) throw new Error(`每篇故事最多保留 ${MAX_STORY_PHOTOS} 张照片`);
  for (const [index, photo] of prepared.entries()) {
    await tx.mediaAsset.create({ data: {
      id: photo.id, ownerId, fileName: photo.fileName, mimeType: "image/webp",
      byteSize: photo.bytes.length, status: "PUBLIC",
    } });
    await tx.travelPhoto.create({ data: {
      id: randomUUID(), memoryId, mediaAssetId: photo.id, filePath: `/api/media/${photo.id}`,
      sortOrder: count + index,
    } });
  }
}

// 将可选日期按 UTC 中午保存，避免跨时区日期偏移。
export function optionalStoryDate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效的到访日期");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("到访日期无效");
  return date;
}
