"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeStoredMediaFiles } from "@/lib/media-storage";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";
import { attachStoryPhotos, optionalStoryDate, prepareStoryPhotos } from "@/lib/story-photos";
import { refreshPlaceCoverAfterRemoval } from "@/lib/place-cover";

export type StoryFormState = { error: string };

// 校验表单文本长度，拒绝空值和异常输入。
function storyField(form: FormData, key: string, max: number, required = false): string {
  const text = String(form.get(key) ?? "").trim();
  if (text.length > max || (required && !text)) throw new Error("请检查故事标题和内容");
  return text;
}

// 为指定地点写故事或追加照片；不要求先创建旅行计划。
export async function savePlaceStoryAction(_state: StoryFormState, form: FormData): Promise<StoryFormState> {
  const actor = await requireEditor();
  const placeId = storyField(form, "placeId", 64, true);
  const requestedId = storyField(form, "id", 64);
  const written: string[] = [];
  const memoryId = requestedId || randomUUID();
  try {
    const place = await prisma.visitedPlace.findUnique({ where: { id: placeId }, select: { id: true, name: true } });
    if (!place) throw new Error("到访地点不存在");
    const title = storyField(form, "title", 120) || place.name;
    const content = storyField(form, "content", 4000);
    const happenedAt = optionalStoryDate(storyField(form, "happenedAt", 10));
    const prepared = await prepareStoryPhotos(form);
    written.push(...prepared.map(photo => photo.fileName));
    await prisma.$transaction(async tx => {
      const current = requestedId
        ? await tx.travelMemory.findFirst({ where: { id: requestedId, placeId }, select: { id: true } })
        : null;
      if (requestedId && !current) throw new Error("故事不存在或不属于这个地点");
      if (!await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { id: true } })) throw new Error("地点已删除");
      const data = { title, content, happenedAt, placeId };
      if (current) await tx.travelMemory.update({ where: { id: memoryId }, data });
      else await tx.travelMemory.create({ data: { id: memoryId, ...data } });
      await attachStoryPhotos(tx, actor.id, memoryId, prepared);
      await tx.auditLog.create({ data: {
        actorId: actor.id, action: current ? "更新" : "新增", entity: "旅行故事",
        entityId: memoryId, summary: `${place.name} · ${title}${prepared.length ? ` · ${prepared.length} 张照片` : ""}`,
      } });
    });
    written.length = 0;
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath("/memories");
    revalidatePath("/admin/places");
    revalidatePath(`/admin/places/${placeId}`);
  } catch (error) {
    await removeStoredMediaFiles(written);
    return { error: error instanceof Error ? error.message : "保存故事失败" };
  }
  redirect(`/admin/places/${encodeURIComponent(placeId)}?storySaved=1#place-stories`);
}

// 删除一个地点下的故事和独占照片，不影响同地点的其它故事。
export async function deletePlaceStoryAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = String(form.get("placeId") ?? "").trim();
  const id = String(form.get("id") ?? "").trim();
  if (!placeId || placeId.length > 64 || !id || id.length > 64) throw new Error("无效的故事编号");
  const files = await prisma.$transaction(async tx => {
    const story = await tx.travelMemory.findFirst({ where: { id, placeId }, include: { photos: true } });
    if (!story) throw new Error("故事不存在或不属于这个地点");
    const ids = story.photos.flatMap(photo => [photo.mediaAssetId, mediaIdFromPath(photo.filePath)].filter((x): x is string => Boolean(x)));
    await tx.travelPhoto.deleteMany({ where: { memoryId: id } });
    await tx.travelMemory.delete({ where: { id } });
    await refreshPlaceCoverAfterRemoval(tx, placeId, ids);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行故事", entityId: id, summary: story.title } });
    return releaseUnusedMedia(tx, ids);
  });
  await removeStoredMediaFiles(files);
  revalidatePath("/visited");
  revalidatePath("/memories");
  revalidatePath(`/admin/places/${placeId}`);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?storyDeleted=1#place-stories`);
}

// 移除指定地点故事中的单张照片并清理不再被引用的媒体文件。
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

// 将历史上未关联地点的故事归入指定足迹，原旅行计划关联与照片均保留。
export async function assignStoryPlaceAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const storyId = String(form.get("storyId") ?? "").trim();
  const placeId = String(form.get("placeId") ?? "").trim();
  if (!storyId || storyId.length > 64 || !placeId || placeId.length > 64) throw new Error("归类参数无效");
  await prisma.$transaction(async tx => {
    const story = await tx.travelMemory.findFirst({ where: { id: storyId, placeId: null } });
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { name: true } });
    if (!story || !place) throw new Error("故事或地点不存在，请刷新重试");
    await tx.travelMemory.update({ where: { id: storyId }, data: { placeId } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "整理", entity: "旅行故事", entityId: storyId, summary: `${story.title} → ${place.name}` } });
  });
  revalidatePath("/visited");
  revalidatePath("/memories");
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${placeId}`);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?storySaved=1#place-stories`);
}
