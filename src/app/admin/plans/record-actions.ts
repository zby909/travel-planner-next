"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visitFormData, visitFormText } from "@/lib/visit-input";

const newPlacesSchema = z.array(z.object({ name: z.string().trim().min(1).max(100), region: z.string().trim().min(1).max(160) }).strict()).max(30);

// 把已结束的计划整理为到访，同一次提交重试时复用已有计划关联。
export async function recordTravelPlanAction(_state: { error: string }, form: FormData) {
  const actor = await requireEditor();
  let planId: string;
  try {
    planId = visitFormText(form, "planId", 64);
    const repeat = new Set(form.getAll("repeatPlaceIds"));
    const requestId = visitFormText(form, "requestId", 36);
    if (repeat.size && !z.uuid().safeParse(requestId).success) throw Error("请重新打开表单并选择重访地点");
    const requested = [...form.getAll("placeIds"), ...repeat];
    if (requested.length > 100 || requested.some(id => typeof id !== "string" || !id || id.length > 64)) throw Error("请选择有效的地点");
    const placeIds = [...new Set(requested as string[])];
    const additions = newPlacesSchema.parse(JSON.parse(visitFormText(form, "newPlaces", 12000) || "[]"));
    if (!placeIds.length && !additions.length) throw Error("请选择到过的地点，或填写一个新地点");
    const visit = visitFormData(form);
    await prisma.$transaction(async tx => {
      const locked = await tx.$executeRaw`UPDATE "TravelPlan" SET "status" = "status" WHERE "id" = ${planId}`;
      if (!locked) throw Error("旅行计划不存在");
      const plan = await tx.travelPlan.findUniqueOrThrow({ where: { id: planId } });
      if (plan.status === "CANCELLED") throw Error("请先核对这趟已取消旅行的状态");
      const selected = await tx.visitedPlace.findMany({ where: { id: { in: placeIds }, isArchived: false }, select: { id: true, name: true } });
      if (selected.length !== placeIds.length) throw Error("选中的地点已变更或归档，请重新打开页面");
      let order = (await tx.visitedPlace.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
      for (const addition of additions) {
        const existing = await tx.visitedPlace.findFirst({ where: addition });
        if (existing?.isArchived) throw Error(`${addition.name} 已归档，请先恢复这个地点`);
        const place = existing ?? await tx.visitedPlace.create({ data: {
          id: randomUUID(), ...addition, image: "images/place-placeholder.svg", sortOrder: ++order,
        } });
        if (!selected.some(item => item.id === place.id)) selected.push(place);
      }
      let recordedCount = 0;
      for (const place of selected) {
        if (repeat.has(place.id)) {
          // 一次表单对每个地点只有一个重访编号，网络重试可复用已保存的记录。
          const id = createHash("sha256").update(JSON.stringify([planId, place.id, requestId])).digest("hex").slice(0, 32);
          const already = await tx.travelMemory.findUnique({ where: { id }, select: { id: true } });
          if (!already) {
            await tx.travelMemory.create({ data: { id, ...visit, planId, placeId: place.id } });
            recordedCount++;
          }
          continue;
        }
        const existing = await tx.travelMemory.findFirst({
          where: { planId, placeId: place.id },
          orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }],
          select: { deletedAt: true },
        });
        if (existing?.deletedAt) throw Error(`${place.name} 的这次旅行已在回收站，可从地点详情恢复`);
        if (!existing) {
          await tx.travelMemory.create({ data: { ...visit, planId, placeId: place.id } });
          recordedCount++;
        }
      }
      await tx.travelPlan.update({ where: { id: planId }, data: { status: "COMPLETED" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "记录旅行", entity: "旅行计划", entityId: planId, summary: `新增 ${recordedCount} 条到访记录（共选 ${selected.length} 个地点）` } });
    });
  } catch (error) {
    return { error: error instanceof z.ZodError ? "新地点需要填写名称和地区" : error instanceof Error ? error.message : "暂时无法记录这趟旅行" };
  }
  revalidatePath("/"); revalidatePath("/visited"); revalidatePath("/visited/[id]", "page");
  revalidatePath("/admin"); revalidatePath("/admin/places"); revalidatePath("/admin/places/[id]", "page");
  revalidatePath("/admin/plans"); revalidatePath(`/admin/plans/${planId}`);
  redirect(`/admin/plans/${encodeURIComponent(planId)}?recorded=1#plan-memories`);
}
