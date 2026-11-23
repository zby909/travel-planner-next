import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaceEditForm } from "@/components/admin-forms";
import { RecordArchiveForm } from "@/components/record-archive-form";
import { mediaIdFromPath } from "@/lib/media-lifecycle";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { getPlaceAlbumUsage } from "@/lib/place-album";
import { getVisitDate, latestPlaceVisit, sortPlaceVisits, visitDateSelect, visitGroupLabel, visitPhotoOrder } from "@/lib/place-visits";
import { PlaceAlbum } from "../place-stories";
import { VisitTrash } from "../visit-trash";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visit?: string; saved?: string; created?: string; noteSaved?: string; photoDeleted?: string; coverSaved?: string; visitDeleted?: string; restored?: string; purged?: string }>;
};

// 列出历次到访，仅加载选中记录的完整手记和照片。
export default async function AdminPlaceEdit({ params, searchParams }: Props) {
  const actor = await requireEditor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [data, settings, usage] = await Promise.all([
    prisma.visitedPlace.findUnique({ where: { id }, include: {
      visits: { select: { ...visitDateSelect, title: true, deletedAt: true, _count: { select: { photos: true } } } },
      _count: { select: { timeline: true } },
    } }),
    getSiteSettings(),
    getPlaceAlbumUsage(prisma, id),
  ]);
  if (!data) notFound();
  const limits = { maxPhotos: settings.albumMaxPhotos, maxBytes: settings.albumMaxMiB * 1024 ** 2 };
  const visits = sortPlaceVisits(data.visits.filter(visit => !visit.deletedAt));
  const trashed = sortPlaceVisits(data.visits.filter(visit => visit.deletedAt));
  const activePhotoCount = visits.reduce((sum, item) => sum + item._count.photos, 0);
  const trashedPhotoCount = trashed.reduce((sum, item) => sum + item._count.photos, 0);
  const visitParam = typeof query.visit === "string" ? query.visit : undefined;
  const selected = visitParam === "new" ? null : visitParam || latestPlaceVisit(visits)?.id;
  const visit = selected ? await prisma.travelMemory.findUnique({ where: { id: selected, placeId: id, deletedAt: null }, include: {
    photos: { orderBy: visitPhotoOrder, include: { mediaAsset: { select: { id: true, status: true, fileName: true, width: true, height: true } } } },
  } }) : null;
  if (selected && !visit) notFound();
  const groupLabels = getGroupLabels(settings);
  const editHref = `/admin/places/${encodeURIComponent(id)}`;
  const publicHref = `/visited/${encodeURIComponent(id)}`;
  const status = query.restored === "1" ? "到访记录已恢复。" : query.noteSaved === "1" ? "到访记录已保存。"
    : query.photoDeleted === "1" ? "照片已移除。"
      : query.coverSaved === "1" ? "地点封面已更新。"
        : null;
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回去过的地方</Link>
    <div className="admin-page-heading">
      <h1>{data.name}</h1>
      <p>{data.region} · {visits.length} 次到访 · {activePhotoCount} 张照片{trashedPhotoCount ? `（另含回收站 ${trashedPhotoCount} 张）` : ""}</p>
    </div>
    {query.created === "1" ? <p className="form-success" role="status">地点和首次到访已保存。</p> : null}
    {query.saved === "1" ? <p className="form-success" role="status">地点资料已更新。</p> : null}
    {query.visitDeleted === "1" ? <p className="form-success" role="status">这次到访已移入回收站。</p> : null}
    {query.purged === "1" ? <p className="form-success" role="status">回收站中的到访已彻底删除。</p> : null}
    <div className="admin-links">
      {data.isArchived ? null : <Link href={publicHref}>查看地点详情 ↗</Link>}
      <a href="#place-info">地点与地图设置 ↓</a>
    </div>
    <p className={`memory-visibility-notice memory-visibility-${settings.visibility.toLowerCase()}`}>
      {data.isArchived ? "地点已归档，下面的到访记录仅在编辑室保留。"
        : settings.visibility === "PUBLIC" ? "此地点的到访记录与照片可公开浏览。" : "此地点的到访记录与照片仅成员可见。"}
    </p>
    <div className="place-editor-layout">
      <nav className="admin-panel place-visit-nav" aria-label="历次到访">
        <h2>历次到访</h2>
        <Link className="button button-dark" href={`${editHref}?visit=new#place-journal`}>＋ 添加一次到访</Link>
        {visits.length ? <ol>
          {visits.map(item => <li key={item.id}>
            <Link href={`${editHref}?visit=${encodeURIComponent(item.id)}#place-journal`} aria-current={visit?.id === item.id ? "page" : undefined}>
              <strong>{getVisitDate(item).label}</strong>
              <span>{visitGroupLabel(groupLabels, item.group)} · {item._count.photos} 张</span>
              {item.title && item.title !== data.name ? <span>{item.title}</span> : null}
            </Link>
          </li>)}
        </ol> : null}
      </nav>
      <PlaceAlbum key={visit?.id ?? `new-${id}`} placeId={id} visit={visit} requestId={randomUUID()} userId={actor.id}
        groupLabels={groupLabels} cover={{ mediaId: mediaIdFromPath(data.image), x: data.coverX, y: data.coverY }}
        usage={usage} limits={limits} status={status} />
    </div>
    <VisitTrash placeId={id} visits={trashed.map(item => ({ id: item.id, title: item.title, label: getVisitDate(item).label, photos: item._count.photos }))} />
    <details className="admin-disclosure place-more-options" id="place-info">
      <summary>地点信息与地图设置</summary>
      <div className="place-settings">
        <PlaceEditForm data={data} />
        <RecordArchiveForm key={String(data.isArchived)} id={id} kind="place" isArchived={data.isArchived}
          relatedCount={data._count.timeline + visits.length} />
      </div>
    </details>
  </main>;
}
