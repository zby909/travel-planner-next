import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { RecordPlanForm } from "./record-form";

// 从计划进入回忆录入，预算与私人旅行备注继续由计划管理。
export default async function RecordPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEditor();
  const { id } = await params;
  const [plan, places, settings] = await Promise.all([
    prisma.travelPlan.findUnique({ where: { id }, select: { title: true, status: true, startDate: true, memories: { select: { placeId: true, deletedAt: true } } } }),
    prisma.visitedPlace.findMany({ where: { isArchived: false }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, region: true } }),
    getSiteSettings(),
  ]);
  if (!plan || plan.status === "CANCELLED") notFound();
  const active = new Set(plan.memories.filter(visit => !visit.deletedAt).map(visit => visit.placeId));
  const trashed = new Set(plan.memories.filter(visit => visit.deletedAt).map(visit => visit.placeId));
  return <main>
    <Link className="admin-back" href={`/admin/plans/${id}`}>← 返回旅行计划</Link>
    <div className="admin-page-heading"><h1>记录这次旅行</h1><p>{plan.title}</p></div>
    <RecordPlanForm planId={id} requestId={randomUUID()} startDate={plan.startDate?.toISOString().slice(0, 10) ?? ""} labels={getGroupLabels(settings)}
      places={places.map(place => ({ ...place, recorded: active.has(place.id), trashed: !active.has(place.id) && trashed.has(place.id) }))} />
  </main>;
}
