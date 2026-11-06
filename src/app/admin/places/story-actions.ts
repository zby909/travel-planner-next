"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeStoredMediaFiles } from "@/lib/media-storage";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";
import { optionalStoryDate } from "@/lib/story-photos";
import { refreshPlaceCoverAfterRemoval } from "@/lib/place-cover";

export type StoryFormState = { error: string };

// 校验地点回忆文字、日期或 ID 的输入长度。
function noteField(form: FormData, key: string, max: number): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > max) throw new Error("输入内容过长");
  return value;
}

// 每个地点只有一份文字，保存时创建或更新，照片始终独立上传不受文字保存影响。
export async function savePlaceStoryAction(_state: StoryFormState, form: FormData): Promise<StoryFormState> {
  const actor = await requireEditor();
  const placeId = noteField(form, "placeId", 64);
  try {
    if (!placeId) throw new Error("缺少足迹地点");
    const content = noteField(form, "content", 20000);
    const happenedAt = optionalStoryDate(noteField(form, "happenedAt", 10));
    await prisma.$transaction(async tx => {
      const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { id: true, name: true } });
      if (!place) throw new Error("地点不存在");
      const note = await tx.travelMemory.upsert({
        where: { placeId },
        create: { placeId, title: place.name, content, happenedAt },
        update: { title: place.name, content, happenedAt },
        select: { id: true },
      });
      await tx.auditLog.create({ data: {
        actorId: actor.id, action: "更新", entity: "地点旅行记录", entityId: note.id, summary: place.name,
      } });
    });
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath("/memories");
    revalidatePath("/admin/places");
    revalidatePath(`/admin/places/${placeId}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
  redirect(`/admin/places/${encodeURIComponent(placeId)}?storySaved=1#place-stories`);
}

// 从统一地点相册中移除单张照片，并正确维护封面及媒体引用计数。
export async function deletePlaceStoryPhotoAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = String(form.get("placeId") ?? "").trim();
  const memoryId = String(form.get("memoryId") ?? "").trim();
  const id = String(form.get("id") ?? "").trim();
  if (![placeId, memoryId, id].every(x => x && x.length <= 64)) throw new Error("照片参数无效");
  const files = await prisma.$transaction(async tx => {
    const photo = await tx.travelPhoto.findFirst({ where: { id, memoryId, memory: { placeId } } });
    if (!photo) throw new Error("照片不存在或不属于这个地点");
    const assetIds = [photo.mediaAssetId, mediaIdFromPath(photo.filePath)].filter((x): x is string => Boolean(x));
    await tx.travelPhoto.delete({ where: { id } });
    await refreshPlaceCoverAfterRemoval(tx, placeId, assetIds);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行照片", entityId: id, summary: placeId } });
    return releaseUnusedMedia(tx, assetIds);
  });
  await removeStoredMediaFiles(files);
  revalidatePath("/visited");
  revalidatePath("/memories");
  revalidatePath(`/admin/places/${placeId}`);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?photoDeleted=1#place-stories`);
}

// 在同一相册里选择封面，必要时回收不再被引用的旧单独封面文件。
export async function setPlaceCoverFromAlbumAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = String(form.get("placeId") ?? "").trim();
  const photoId = String(form.get("photoId") ?? "").trim();
  if (!placeId || placeId.length > 64 || !photoId || photoId.length > 64) throw Error("无效的照片参数");
  const files = await prisma.$transaction(async tx => {
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { image: true } });
    const photo = await tx.travelPhoto.findFirst({ where: { id: photoId, memory: { placeId } },
      include: { mediaAsset: { select: { id: true, fileName: true, status: true } } } });
    if (!place || !photo?.mediaAsset || photo.mediaAsset.status !== "PUBLIC" ||
        photo.mediaAsset.fileName !== `${photo.mediaAsset.id}.webp`) throw Error("照片不属于此地点");
    const previousId = mediaIdFromPath(place.image);
    await tx.visitedPlace.update({ where: { id: placeId }, data: { image: `api/media/${photo.mediaAsset.id}` } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "足迹封面", entityId: placeId, summary: photoId } });
    return releaseUnusedMedia(tx, previousId ? [previousId] : []);
  });
  await removeStoredMediaFiles(files);
  revalidatePath("/");
  revalidatePath("/visited");
  revalidatePath(`/admin/places/${placeId}`);
  revalidatePath("/admin/places");
  redirect(`/admin/places/${encodeURIComponent(placeId)}?coverSaved=1#place-stories`);
}

// 老日记归入地点时合并其文字与照片，不会创建第二篇或破坏计划关联的媒体。
export async function assignStoryPlaceAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const storyId = String(form.get("storyId") ?? "").trim();
  const placeId = String(form.get("placeId") ?? "").trim();
  if (!storyId || storyId.length > 64 || !placeId || placeId.length > 64) throw new Error("归类参数无效");
  await prisma.$transaction(async tx => {
    const story = await tx.travelMemory.findFirst({ where: { id: storyId, placeId: null } });
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { name: true } });
    if (!story || !place) throw new Error("故事或地点不存在，请刷新重试");
    const existing = await tx.travelMemory.findUnique({ where: { placeId } });
    if (existing) {
      const appendix = [story.title !== place.name ? story.title : "", story.content].filter(Boolean).join("\n");
      const next = [existing.content, appendix].filter(Boolean).join("\n\n");
      await tx.travelMemory.update({ where: { id: existing.id }, data: {
        content: next, happenedAt: existing.happenedAt ?? story.happenedAt,
      } });
      await tx.travelPhoto.updateMany({ where: { memoryId: storyId }, data: { memoryId: existing.id } });
      await tx.travelMemory.delete({ where: { id: storyId } });
    } else {
      await tx.travelMemory.update({ where: { id: storyId }, data: {
        placeId, title: place.name,
        content: [story.title !== place.name ? story.title : "", story.content].filter(Boolean).join("\n"),
      } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "整理", entity: "地点旅行记录", entityId: storyId, summary: `${story.title} → ${place.name}` } });
  });
  revalidatePath("/visited");
  revalidatePath("/memories");
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${placeId}`);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?storySaved=1#place-stories`);
}
