"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp, { type OutputInfo } from "sharp";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";
import { getUploadDirectory, removeStoredMediaFiles } from "@/lib/media-storage";

export type CoverUploadState = { error: string };
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

// 只接受真实的静态照片，统一压缩为不含 EXIF/GPS 的 WebP 并记录宽高。
async function encodeCover(file: File): Promise<{ data: Buffer; info: OutputInfo }> {
  if (file.size < 20 || file.size > MAX_IMAGE_SIZE) throw new Error("请选择不超过 8 MiB 的照片");
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("只支持 JPG、PNG、WebP、AVIF 照片");
  try {
    const picture = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await picture.metadata();
    const isAvif = metadata.format === "heif" && metadata.compression === "av1";
    if ((!["jpeg", "png", "webp"].includes(metadata.format ?? "") && !isAvif) || (metadata.pages ?? 1) !== 1) {
      throw new Error("文件格式无效");
    }
    return await picture.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error("照片无法处理，请改用非动态的 JPG、PNG、WebP 或 AVIF 图片");
  }
}

// 编辑者可为现有目的地替换封面；文件、媒体记录及业务引用保持一致。
export async function uploadCoverAction(_state: CoverUploadState, form: FormData): Promise<CoverUploadState> {
  const actor = await requireEditor();
  const entityId = String(form.get("id") ?? "");
  if (entityId.length < 1 || entityId.length > 64) {
    return { error: "目的地参数无效" };
  }
  const file = form.get("image");
  if (!(file instanceof File)) return { error: "请选择一张照片" };
  const directory = getUploadDirectory();
  const imageId = randomUUID();
  const filename = `${imageId}.webp`;
  const filePath = join(directory, filename);
  let written = false;
  try {
    const exists = await prisma.destination.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!exists) throw new Error("目的地已不存在，请返回列表重新选择");
    const { data: buffer, info } = await encodeCover(file);
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, buffer, { flag: "wx" });
    written = true;
    const oldFiles = await prisma.$transaction(async tx => {
      const previous = (await tx.destination.findUniqueOrThrow({ where: { id: entityId }, select: { imagePath: true } })).imagePath;
      await tx.mediaAsset.create({ data: {
        id: imageId, ownerId: actor.id, fileName: filename, mimeType: "image/webp",
        byteSize: buffer.length, width: info.width, height: info.height, status: "PUBLIC",
      } });
      await tx.destination.update({ where: { id: entityId }, data: { imagePath: `/api/media/${imageId}` } });
      await tx.auditLog.create({ data: {
        actorId: actor.id, action: "更新", entity: "目的地封面",
        entityId, summary: "通过管理后台上传旅行照片",
      } });
      const previousId = mediaIdFromPath(previous);
      return releaseUnusedMedia(tx, previousId ? [previousId] : []);
    });
    written = false;
    await removeStoredMediaFiles(oldFiles);
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/destinations/${entityId}`);
    revalidatePath("/admin/destinations");
    revalidatePath(`/admin/destinations/${entityId}`);
  } catch (error) {
    if (written) await unlink(filePath).catch(() => {});
    return { error: error instanceof Error ? error.message : "上传失败，请稍后重试" };
  }
  redirect(`/admin/destinations/${encodeURIComponent(entityId)}?photo=1`);
}
