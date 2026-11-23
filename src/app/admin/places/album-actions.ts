"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visitFormRevision, visitFormText } from "@/lib/visit-input";

const photosSchema = z.array(z.object({
  id: z.string().min(1).max(64), caption: z.string().trim().max(500), featured: z.boolean(),
}).strict()).max(500);

// 一次保存整本相册的顺序和说明，用版本号避免覆盖另一次整理或上传。
export async function saveVisitAlbumAction(_state: { error: string; saved: boolean }, form: FormData) {
  const actor = await requireEditor();
  try {
    const placeId = visitFormText(form, "placeId", 64);
    const visitId = visitFormText(form, "visitId", 64);
    const revision = visitFormRevision(form, "albumRevision");
    const photos = photosSchema.parse(JSON.parse(visitFormText(form, "photos", 1600000)));
    if (new Set(photos.map(photo => photo.id)).size !== photos.length) throw Error("相册参数无效");
    await prisma.$transaction(async tx => {
      const changed = await tx.travelMemory.updateMany({ where: { id: visitId, placeId, deletedAt: null, albumRevision: revision }, data: { albumRevision: { increment: 1 } } });
      if (!changed.count) throw Error("相册已有新照片或已被另一位成员整理。请重新打开相册后核对。");
      const existing = await tx.travelPhoto.findMany({ where: { memoryId: visitId }, select: { id: true, altText: true, sortOrder: true, isFeatured: true } });
      const byId = new Map(existing.map(photo => [photo.id, photo]));
      if (existing.length !== photos.length || photos.some(photo => !byId.has(photo.id))) throw Error("相册照片已变化，请重新打开后核对");
      for (const [sortOrder, photo] of photos.entries()) {
        const old = byId.get(photo.id)!;
        const altText = photo.caption || null;
        if (old.sortOrder !== sortOrder || old.altText !== altText || old.isFeatured !== photo.featured) {
          await tx.travelPhoto.update({ where: { id: photo.id, memoryId: visitId }, data: { sortOrder, altText, isFeatured: photo.featured } });
        }
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "整理相册", entity: "到访记录", entityId: visitId, summary: `整理 ${photos.length} 张照片` } });
    });
    revalidatePath("/");
    revalidatePath(`/visited/${placeId}`);
    revalidatePath("/admin");
    revalidatePath(`/admin/places/${placeId}`);
    return { error: "", saved: true };
  } catch (error) {
    return { error: error instanceof z.ZodError ? "照片说明最多 500 字" : error instanceof Error ? error.message : "相册暂时无法保存", saved: false };
  }
}
