import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { DestinationEditForm } from "@/components/admin-forms";
import { RecordArchiveForm } from "@/components/record-archive-form";
import { CoverUploadForm } from "@/components/cover-upload-form";
import { parseJsonArray } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; photo?: string }> };

export default async function DestinationEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const { saved, created, photo } = await searchParams;
  const [data, settings] = await Promise.all([
    prisma.destination.findUnique({
      where: { id },
      include: { guide: { include: { days: { orderBy: { sortOrder: "asc" } } } }, _count: { select: { plans: true } } },
    }),
    getSiteSettings(),
  ]);
  if (!data) notFound();
  return (
    <main>
      <Link className="admin-back" href="/admin/destinations">← 返回所有目的地</Link>
      <div className="admin-page-heading"><p className="eyebrow">EDIT DESTINATION</p><h1>{data.title}</h1><p>在同一处维护目的地资料、路线、每日攻略、预算和封面照片。</p></div>
      {created === "1" ? <p className="form-success" role="status">目的地已创建，可以继续完善预算、路线和攻略。</p> : null}
      {saved === "1" ? <p className="form-success" role="status">{data.isArchived ? "修改已保存；归档记录仍仅在编辑室保留。" : "保存成功，公开页面已更新。"}</p> : null}
      {photo === "1" ? <p className="form-success" role="status">封面照片已更新。</p> : null}
      <RecordArchiveForm key={String(data.isArchived)} id={id} kind="destination" isArchived={data.isArchived} relatedCount={data._count.plans} />
      <CoverUploadForm id={id} kind="destination" imageUrl={data.imagePath ?? "/images/destination-placeholder.svg"} />
      <DestinationEditForm key={id} data={{
        ...data,
        types: parseJsonArray<string>(data.typesJson),
        seasons: parseJsonArray<string>(data.seasonsJson),
        route: parseJsonArray<string>(data.routeJson),
        spots: parseJsonArray<string>(data.spotsJson),
        guide: data.guide ? { ...data.guide, days: data.guide.days.map(({ day, title, detail }) => ({ day, title, detail })) } : null,
      }} currency={settings.currency} />
    </main>
  );
}
