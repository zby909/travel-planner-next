import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaceEditForm } from "@/components/admin-forms";
import { RecordArchiveForm } from "@/components/record-archive-form";
import { mediaIdFromPath } from "@/lib/media-lifecycle";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { PlaceAlbum } from "../place-stories";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string; storySaved?: string; photoDeleted?: string; coverSaved?: string }>;
};

// 地点详情只加载一份文字与一个相册，不再提供创建第二篇故事的入口。
export default async function AdminPlaceEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const [data, settings] = await Promise.all([
    prisma.visitedPlace.findUnique({ where: { id }, include: {
      memory: { include: { photos: { orderBy: { sortOrder: "asc" },
        include: { mediaAsset: { select: { id: true, status: true, fileName: true } } } } } },
      _count: { select: { timeline: true } },
    } }),
    getSiteSettings(),
  ]);
  if (!data) notFound();
  const query = await searchParams;
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回去过的地方</Link>
    <div className="admin-page-heading">
      <p className="eyebrow">VISITED / PHOTO ALBUM</p>
      <h1>{data.name}</h1>
      <p>{data.region} · {data.whenLabel || data.memory?.happenedAt?.toISOString().slice(0, 10) || "到访日期待补充"}</p>
    </div>
    {query.created === "1" ? <p className="form-success" role="status">地点已创建，现在可以上传照片；网络中断后能够继续上传。</p> : null}
    {query.saved === "1" ? <p className="form-success" role="status">地点资料已更新。</p> : null}
    <div className="admin-links">
      <Link href={`/visited#place-${id}`}>查看公开地点 ↗</Link>
      <a href="#place-stories">文字和相册 ↓</a>
      <a href="#place-info">更多地点设置 ↓</a>
    </div>
    <PlaceAlbum
      placeId={id} placeName={data.name} note={data.memory} coverMediaId={mediaIdFromPath(data.image)}
      visibility={settings.visibility} archived={data.isArchived}
      saved={query.storySaved === "1"} photoDeleted={query.photoDeleted === "1"} coverSaved={query.coverSaved === "1"}
    />
    <details className="admin-disclosure place-more-options" id="place-info">
      <summary>地点信息与地图设置</summary>
      <div className="place-settings">
        <PlaceEditForm data={data} groupLabels={getGroupLabels(settings)} />
        <RecordArchiveForm key={String(data.isArchived)} id={id} kind="place" isArchived={data.isArchived}
          relatedCount={data._count.timeline + (data.memory ? 1 : 0)} />
      </div>
    </details>
  </main>;
}
