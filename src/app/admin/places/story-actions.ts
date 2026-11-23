"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeStoredMediaFiles } from "@/lib/media-storage";
import { mediaIdFromPath, releaseUnusedMedia } from "@/lib/media-lifecycle";
import { visitFormData, visitFormRevision, visitFormText } from "@/lib/visit-input";
import { visitPhotoOrder } from "@/lib/place-visits";
import { refreshPlaceCoverAfterRemoval } from "@/lib/place-cover";

export type StoryFormState = { error: string; visitId?: string; revision?: number };

// 保持足迹目录、地点详情和后台到访记录同步刷新。
function revalidatePlace(placeId: string) {
  revalidatePath("/");
  revalidatePath("/visited");
  revalidatePath(`/visited/${placeId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${placeId}`);
  revalidatePath("/admin/plans/[id]", "page");
}

// 返回到访编辑器，并在动作完成后保留当前选中的到访。
function editUrl(placeId: string, visitId: string, status: string) {
  return `/admin/places/${encodeURIComponent(placeId)}?${new URLSearchParams({ visit: visitId, [status]: "1" })}#place-journal`;
}

// 每次到访单独新增或编辑，保留同地其他手记与相册。
export async function savePlaceStoryAction(_state: StoryFormState, form: FormData): Promise<StoryFormState> {
  const actor = await requireEditor();
  let placeId: string;
  let visitId: string;
  let revision: number;
  try {
    placeId = visitFormText(form, "placeId", 64);
    const id = visitFormText(form, "visitId", 64);
    if (!placeId) throw Error("请选择要记录的地点");
    const data = visitFormData(form);
    const saved = await prisma.$transaction(async tx => {
      const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { id: true, name: true } });
      if (!place) throw Error("地点不存在");
      let visit;
      let isRetry = false;
      if (id) {
        const expected = visitFormRevision(form, "revision");
        const changed = await tx.travelMemory.updateMany({ where: { id, placeId, deletedAt: null, revision: expected },
          data: { ...data, revision: { increment: 1 } } });
        if (!changed.count) throw Error("这篇手记已被另一位成员修改或移入回收站。你的文字仍保留在表单中，请先重新打开记录核对。");
        visit = { id, revision: expected + 1 };
      } else {
        const requestId = visitFormText(form, "requestId", 64);
        if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw Error("新到访编号无效，请重新打开页面");
        const existing = await tx.travelMemory.findUnique({ where: { id: requestId } });
        if (existing) {
          if (existing.placeId !== placeId || existing.deletedAt) throw Error("这次到访已变更，请重新打开记录");
          if (existing.revision !== 0 || existing.title !== data.title || existing.content !== data.content ||
            existing.whenLabel !== data.whenLabel || existing.group !== data.group || existing.happenedAt?.getTime() !== data.happenedAt?.getTime()) {
            throw Error("这次到访已经保存过。当前文字保留在表单中，请重新打开已保存的记录核对。");
          }
          visit = { id: existing.id, revision: existing.revision };
          isRetry = true;
        } else visit = await tx.travelMemory.create({ data: { id: requestId, ...data, placeId }, select: { id: true, revision: true } });
      }
      if (!isRetry) {
        await tx.auditLog.create({ data: {
          actorId: actor.id, action: id ? "更新" : "新增", entity: "到访记录", entityId: visit.id, summary: place.name,
        } });
      }
      return visit;
    });
    visitId = saved.id;
    revision = saved.revision;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
  revalidatePlace(placeId);
  return { error: "", visitId, revision };
}

// 移除当前到访的一张照片，共享封面或其他内容仍可引用原资源。
export async function deletePlaceStoryPhotoAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = visitFormText(form, "placeId", 64);
  const visitId = visitFormText(form, "visitId", 64);
  const id = visitFormText(form, "id", 64);
  if (!placeId || !visitId || !id) throw Error("照片参数无效");
  const files = await prisma.$transaction(async tx => {
    const locked = await tx.travelMemory.updateMany({ where: { id: visitId, placeId, deletedAt: null }, data: { albumRevision: { increment: 1 } } });
    if (!locked.count) throw Error("到访已移入回收站");
    const photo = await tx.travelPhoto.findFirst({ where: { id, memoryId: visitId, memory: { placeId } },
      include: { memory: { select: { place: { select: { name: true } } } } } });
    if (!photo) throw Error("照片不存在或不属于这次到访");
    const albumMediaId = photo.mediaAssetId ?? mediaIdFromPath(photo.filePath);
    await tx.travelPhoto.delete({ where: { id } });
    const assetIds = albumMediaId ? [albumMediaId] : [];
    await refreshPlaceCoverAfterRemoval(tx, placeId, assetIds);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "删除", entity: "旅行照片", entityId: id, summary: photo.memory?.place?.name ?? placeId } });
    return releaseUnusedMedia(tx, assetIds);
  });
  await removeStoredMediaFiles(files);
  revalidatePlace(placeId);
  redirect(editUrl(placeId, visitId, "photoDeleted"));
}

// 从任意一次到访的相册选择地点封面。
export async function setPlaceCoverFromAlbumAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = visitFormText(form, "placeId", 64);
  const visitId = visitFormText(form, "visitId", 64);
  const photoId = visitFormText(form, "photoId", 64);
  const coverX = Number(visitFormText(form, "coverX", 3) || "50");
  const coverY = Number(visitFormText(form, "coverY", 3) || "50");
  if (![coverX, coverY].every(value => Number.isInteger(value) && value >= 0 && value <= 100)) throw Error("封面构图位置无效");
  if (!placeId || !visitId || !photoId) throw Error("无效的照片参数");
  const files = await prisma.$transaction(async tx => {
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { name: true, image: true } });
    const photo = await tx.travelPhoto.findFirst({ where: { id: photoId, memoryId: visitId, memory: { placeId, deletedAt: null } },
      include: { mediaAsset: { select: { id: true, fileName: true, status: true } } } });
    if (!place || !photo?.mediaAsset || photo.mediaAsset.status !== "PUBLIC" ||
        photo.mediaAsset.fileName !== `${photo.mediaAsset.id}.webp`) throw Error("照片不属于这次到访或无法用作封面");
    const previousId = mediaIdFromPath(place.image);
    await tx.visitedPlace.update({ where: { id: placeId }, data: { image: `api/media/${photo.mediaAsset.id}`, coverX, coverY } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "更新", entity: "足迹封面", entityId: placeId, summary: place.name } });
    return releaseUnusedMedia(tx, previousId ? [previousId] : []);
  });
  await removeStoredMediaFiles(files);
  revalidatePlace(placeId);
  redirect(editUrl(placeId, visitId, "coverSaved"));
}

// 到访先移入回收站，手记和照片可由成员恢复。
export async function deletePlaceVisitAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = visitFormText(form, "placeId", 64);
  const visitId = visitFormText(form, "visitId", 64);
  await prisma.$transaction(async tx => {
    const visit = await tx.travelMemory.findUnique({ where: { id: visitId, placeId, deletedAt: null }, select: {
      photos: { select: { mediaAssetId: true, filePath: true } }, place: { select: { name: true } },
    } });
    if (!visit?.place) throw Error("到访记录不存在或不属于这个地点");
    const trashed = await tx.travelMemory.updateMany({ where: { id: visitId, placeId, deletedAt: null },
      data: { deletedAt: new Date(), revision: { increment: 1 }, albumRevision: { increment: 1 } } });
    if (!trashed.count) throw Error("到访记录已移入回收站或不存在");
    const ids = visit.photos.map(photo => photo.mediaAssetId ?? mediaIdFromPath(photo.filePath)).filter(id => id !== null);
    await refreshPlaceCoverAfterRemoval(tx, placeId, ids);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "移入回收站", entity: "到访记录", entityId: visitId, summary: visit.place.name } });
  });
  revalidatePlace(placeId);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?visitDeleted=1#place-journal`);
}

// 归类旧手记时沿用原记录与相册 ID，作为独立的一次到访。
export async function assignStoryPlaceAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const storyId = visitFormText(form, "storyId", 64);
  const placeId = visitFormText(form, "placeId", 64);
  if (!storyId || !placeId) throw Error("请选择手记与地点");
  await prisma.$transaction(async tx => {
    const story = await tx.travelMemory.findUnique({ where: { id: storyId, placeId: null, deletedAt: null } });
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId, isArchived: false }, select: { name: true } });
    if (!story || !place) throw Error("手记或地点已变更，请刷新重试");
    await tx.travelMemory.update({ where: { id: storyId }, data: { placeId, revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "整理", entity: "到访记录", entityId: storyId, summary: `${story.title} → ${place.name}` } });
  });
  revalidatePlace(placeId);
  redirect(editUrl(placeId, storyId, "noteSaved"));
}

// 恢复同一地点回收站中的到访并保留原相册地址；若地点封面为占位图则自动恢复首图。
export async function restorePlaceVisitAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = visitFormText(form, "placeId", 64);
  const visitId = visitFormText(form, "visitId", 64);
  await prisma.$transaction(async tx => {
    const changed = await tx.travelMemory.updateMany({ where: { id: visitId, placeId, deletedAt: { not: null } },
      data: { deletedAt: null, revision: { increment: 1 }, albumRevision: { increment: 1 } } });
    if (!changed.count) throw Error("这次到访已恢复或已被彻底删除");
    const place = await tx.visitedPlace.findUnique({ where: { id: placeId }, select: { name: true, image: true } });
    if (place?.image.includes("placeholder")) {
      const photos = await tx.travelPhoto.findMany({
        where: { memoryId: visitId }, orderBy: visitPhotoOrder,
        select: { mediaAssetId: true, filePath: true, mediaAsset: { select: { id: true, status: true, fileName: true } } },
      });
      const coverId = photos.map(photo => photo.mediaAsset
        ? (photo.mediaAsset.status === "PUBLIC" && photo.mediaAsset.fileName === `${photo.mediaAsset.id}.webp` ? photo.mediaAsset.id : null)
        : mediaIdFromPath(photo.filePath)).find(Boolean);
      if (coverId) {
        await tx.visitedPlace.update({ where: { id: placeId }, data: { image: `api/media/${coverId}`, coverX: 50, coverY: 50 } });
      }
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "恢复", entity: "到访记录", entityId: visitId, summary: place?.name ?? placeId } });
  });
  revalidatePlace(placeId);
  redirect(editUrl(placeId, visitId, "restored"));
}

// 只允许从回收站彻底删除到访，再按实际引用清理媒体。
export async function purgePlaceVisitAction(form: FormData): Promise<void> {
  const actor = await requireEditor();
  const placeId = visitFormText(form, "placeId", 64);
  const visitId = visitFormText(form, "visitId", 64);
  const files = await prisma.$transaction(async tx => {
    const visit = await tx.travelMemory.findUnique({ where: { id: visitId, placeId, deletedAt: { not: null } },
      include: { photos: true, place: { select: { name: true } } } });
    if (!visit) throw Error("仅能彻底删除回收站内的到访");
    const ids = visit.photos.map(photo => photo.mediaAssetId ?? mediaIdFromPath(photo.filePath)).filter(id => id !== null);
    await tx.travelPhoto.deleteMany({ where: { memoryId: visitId } });
    await tx.travelMemory.delete({ where: { id: visitId } });
    await refreshPlaceCoverAfterRemoval(tx, placeId, ids);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "彻底删除", entity: "到访记录", entityId: visitId, summary: visit.place?.name ?? placeId } });
    return releaseUnusedMedia(tx, ids);
  });
  await removeStoredMediaFiles(files);
  revalidatePlace(placeId);
  redirect(`/admin/places/${encodeURIComponent(placeId)}?purged=1#visit-trash`);
}
