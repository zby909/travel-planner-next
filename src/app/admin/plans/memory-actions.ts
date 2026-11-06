"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { requireEditor } from "@/lib/auth";
import { getUploadDirectory, removeStoredMediaFiles } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";

export type MemoryFormState = { error: string };

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const MAX_PHOTO_BATCH_SIZE = 8 * 1024 * 1024;
const MAX_PHOTOS_PER_MEMORY = 12;

// 读取旅行日记表单字段并限制文本长度。
function memoryField(form: FormData, key: string, maxLength: number, required = false): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > maxLength || (required && !value)) throw new Error("请检查旅行日记中的必填内容");
  return value;
}

// 解析日记日期并固定到 UTC 中午，避免不同时区显示为前一天。
function memoryDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效的旅行日期");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("旅行日期无效");
  return date;
}

// 校验照片真实格式、像素数量并统一压缩为清除 EXIF/GPS 的 WebP。
async function encodeMemoryPhoto(file: File): Promise<Buffer> {
  if (file.size < 20 || file.size > MAX_PHOTO_SIZE) throw new Error("单张照片必须在 20 字节至 8 MiB 之间");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("日记照片只支持 JPG、PNG 和 WebP");
  try {
    const picture = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await picture.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) {
      throw new Error("照片格式无效");
    }
    return await picture.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    throw new Error("照片无法处理，请改用非动态的 JPG、PNG 或 WebP 图片");
  }
}

// 创建或编辑旅行日记，并将本次选择的照片与媒体资源在同一事务中关联。
export async function saveTravelMemoryAction(_state: MemoryFormState, form: FormData): Promise<MemoryFormState> {
  const actor = await requireEditor();
  const writtenFiles: string[] = [];
  let planId = "";
  let memoryId = "";
  try {
    planId = memoryField(form, "planId", 64, true);
    const plan = await prisma.travelPlan.findUnique({ where: { id: planId }, select: { id: true, title: true } });
    if (!plan) throw new Error("关联的旅行计划不存在");

    const requestedId = memoryField(form, "id", 64);
    memoryId = requestedId || randomUUID();
    const title = memoryField(form, "title", 120, true);
    const content = memoryField(form, "content", 4000);
    const happenedAt = memoryDate(memoryField(form, "happenedAt", 10, true));
    const placeId = memoryField(form, "placeId", 64);
    if (placeId && !(await prisma.visitedPlace.findUnique({ where: { id: placeId }, select: { id: true } }))) {
      throw new Error("关联的到访地点不存在");
    }

    const photoValues = form.getAll("photos");
    if (photoValues.some(value => !(value instanceof File))) throw new Error("照片上传内容无效");
    const photos = photoValues.filter((value): value is File => value instanceof File && value.size > 0);
    if (photos.length > 8) throw new Error("单次最多选择 8 张照片");
    if (photos.reduce((sum, photo) => sum + photo.size, 0) > MAX_PHOTO_BATCH_SIZE) {
      throw new Error("单次照片总大小不能超过 8 MiB，请分批添加");
    }

    const directory = getUploadDirectory();
    const preparedPhotos: { id: string; fileName: string; bytes: Buffer }[] = [];
    for (const photo of photos) {
      const bytes = await encodeMemoryPhoto(photo);
      const id = randomUUID();
      const fileName = `${id}.webp`;
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, fileName), bytes, { flag: "wx" });
      writtenFiles.push(fileName);
      preparedPhotos.push({ id, fileName, bytes });
    }

    await prisma.$transaction(async tx => {
      const currentPlan = await tx.travelPlan.findUnique({ where: { id: planId }, select: { id: true } });
      if (!currentPlan) throw new Error("旅行计划已被删除，请刷新页面");

      const existing = requestedId
        ? await tx.travelMemory.findFirst({ where: { id: memoryId, planId }, select: { id: true } })
        : null;
      if (requestedId && !existing) throw new Error("旅行日记不存在或不属于这趟旅行");

      const currentPhotoCount = await tx.travelPhoto.count({ where: { memoryId } });
      if (currentPhotoCount + preparedPhotos.length > MAX_PHOTOS_PER_MEMORY) {
        throw new Error(`每篇旅行日记最多保留 ${MAX_PHOTOS_PER_MEMORY} 张照片`);
      }

      const memoryData = { planId, title, content, happenedAt, placeId: placeId || null };
      if (existing) await tx.travelMemory.update({ where: { id: memoryId }, data: memoryData });
      else await tx.travelMemory.create({ data: { id: memoryId, ...memoryData } });

      for (const [index, photo] of preparedPhotos.entries()) {
        await tx.mediaAsset.create({
          data: {
            id: photo.id, ownerId: actor.id, fileName: photo.fileName,
            mimeType: "image/webp", byteSize: photo.bytes.length, status: "PUBLIC",
          },
        });
        await tx.travelPhoto.create({
          data: {
            id: randomUUID(), planId, memoryId, mediaAssetId: photo.id,
            filePath: `/api/media/${photo.id}`, altText: title, sortOrder: currentPhotoCount + index,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id, action: existing ? "更新" : "新增", entity: "旅行日记", entityId: memoryId,
          summary: `${plan.title} · ${title}${preparedPhotos.length ? ` · 新增 ${preparedPhotos.length} 张照片` : ""}`,
        },
      });
    });
    writtenFiles.length = 0;

    revalidatePath("/");
    revalidatePath("/memories");
    revalidatePath(`/admin/plans/${planId}`);
  } catch (error) {
    await removeStoredMediaFiles(writtenFiles);
    return { error: error instanceof Error ? error.message : "保存旅行日记失败" };
  }
  redirect(`/admin/plans/${encodeURIComponent(planId)}?memorySaved=1&memoryId=${encodeURIComponent(memoryId)}`);
}

// 删除一篇旅行日记及其照片元数据、媒体资源和持久化文件。
export async function deleteTravelMemoryAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  const planId = String(form.get("planId") ?? "").trim();
  if (!id || id.length > 64 || !planId || planId.length > 64) throw new Error("无效的旅行日记编号");

  const fileNames = await prisma.$transaction(async tx => {
    const memory = await tx.travelMemory.findFirst({ where: { id, planId }, include: { photos: true } });
    if (!memory) throw new Error("旅行日记不存在或不属于这趟旅行");
    const assetIds = memory.photos.flatMap(photo => [photo.mediaAssetId, mediaIdFromPath(photo.filePath)].filter((value): value is string => Boolean(value)));
    await tx.travelPhoto.deleteMany({ where: { memoryId: id } });
    await tx.travelMemory.delete({ where: { id } });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "删除", entity: "旅行日记", entityId: id, summary: memory.title },
    });
    return releaseUnusedMedia(tx, assetIds);
  });
  await removeStoredMediaFiles(fileNames);
  revalidatePath("/");
  revalidatePath("/memories");
  revalidatePath(`/admin/plans/${planId}`);
  redirect(`/admin/plans/${encodeURIComponent(planId)}?memoryDeleted=1`);
}

// 删除单张日记照片，同时撤销其媒体访问记录并清理文件。
export async function deleteTravelMemoryPhotoAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const id = String(form.get("id") ?? "").trim();
  const memoryId = String(form.get("memoryId") ?? "").trim();
  const planId = String(form.get("planId") ?? "").trim();
  if (!id || id.length > 64 || !memoryId || memoryId.length > 64 || !planId || planId.length > 64) {
    throw new Error("无效的旅行照片编号");
  }

  const files = await prisma.$transaction(async tx => {
    const photo = await tx.travelPhoto.findFirst({
      where: { id, memoryId, planId }, include: { memory: { select: { title: true } } },
    });
    if (!photo) throw new Error("照片不存在或不属于这篇旅行日记");
    await tx.travelPhoto.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: "删除", entity: "旅行照片", entityId: id,
        summary: `${photo.memory?.title ?? "旅行日记"} · 删除一张照片`,
      },
    });
    return releaseUnusedMedia(tx, [photo.mediaAssetId, mediaIdFromPath(photo.filePath)].filter((value): value is string => Boolean(value)));
  });
  await removeStoredMediaFiles(files);
  revalidatePath("/");
  revalidatePath("/memories");
  revalidatePath(`/admin/plans/${planId}`);
  redirect(`/admin/plans/${encodeURIComponent(planId)}?photoDeleted=1&memoryId=${encodeURIComponent(memoryId)}`);
}
