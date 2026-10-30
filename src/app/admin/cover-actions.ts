"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CoverUploadState = { error: string };
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

// 只接受真实的静态照片，统一压缩为不含 EXIF/GPS 的 WebP。
async function encodeCover(file: File): Promise<Buffer> {
  if (file.size < 20 || file.size > MAX_IMAGE_SIZE) throw new Error("请选择不超过 8 MiB 的照片");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("只支持 JPG、PNG、WebP 照片");
  try {
    const picture = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await picture.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) {
      throw new Error("文件格式无效");
    }
    return await picture.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    throw new Error("照片无法处理，请改用非动态的 JPG、PNG 或 WebP 图片");
  }
}

// 编辑者可为现有目的地或足迹替换封面；文件、媒体记录及业务引用保持一致。
export async function uploadCoverAction(_state: CoverUploadState, form: FormData): Promise<CoverUploadState> {
  const actor = await requireEditor();
  const kind = String(form.get("kind") ?? "");
  const entityId = String(form.get("id") ?? "");
  if (!(["destination", "place"].includes(kind)) || entityId.length < 1 || entityId.length > 64) {
    return { error: "地点参数无效" };
  }
  const file = form.get("image");
  if (!(file instanceof File)) return { error: "请选择一张照片" };
  const directory = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
  const imageId = randomUUID();
  const filename = `${imageId}.webp`;
  const filePath = join(directory, filename);
  let written = false;
  try {
    const exists = kind === "destination"
      ? await prisma.destination.findUnique({ where: { id: entityId }, select: { id: true } })
      : await prisma.visitedPlace.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!exists) throw new Error("地点已不存在，请返回列表重新选择");
    const buffer = await encodeCover(file);
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, buffer, { flag: "wx" });
    written = true;
    await prisma.$transaction(async tx => {
      await tx.mediaAsset.create({ data: {
        id: imageId, ownerId: actor.id, fileName: filename, mimeType: "image/webp",
        byteSize: buffer.length, status: "PUBLIC",
      } });
      if (kind === "destination") {
        await tx.destination.update({ where: { id: entityId }, data: { imagePath: `/api/media/${imageId}` } });
      } else {
        await tx.visitedPlace.update({ where: { id: entityId }, data: { image: `api/media/${imageId}` } });
      }
      await tx.auditLog.create({ data: {
        actorId: actor.id, action: "更新", entity: kind === "destination" ? "目的地封面" : "足迹封面",
        entityId, summary: "通过管理后台上传旅行照片",
      } });
    });
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath(`/destinations/${entityId}`);
    revalidatePath(`/admin/${kind === "destination" ? "destinations" : "places"}/${entityId}`);
  } catch (error) {
    if (written) await unlink(filePath).catch(() => {});
    return { error: error instanceof Error ? error.message : "上传失败，请稍后重试" };
  }
  redirect(`/admin/${kind === "destination" ? "destinations" : "places"}/${encodeURIComponent(entityId)}?photo=1`);
}
