import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaceEditForm } from "@/components/admin-forms";
import { RecordArchiveForm } from "@/components/record-archive-form";
import { CoverUploadForm } from "@/components/cover-upload-form";
import { getPlaceImageUrl } from "@/lib/media";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { PlaceStories } from "../place-stories";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; photo?: string; storySaved?: string; storyDeleted?: string; photoDeleted?: string; editStory?: string }> };

export default async function AdminPlaceEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const [data, settings] = await Promise.all([
    prisma.visitedPlace.findUnique({ where: { id }, include: {
      memories: {
        orderBy: [{ happenedAt: "desc" }, { createdAt: "desc" }],
        include: { photos: { orderBy: { sortOrder: "asc" },
          include: { mediaAsset: { select: { id: true, status: true, fileName: true } } } } },
      },
      _count: { select: { timeline: true, memories: true } },
    } }),
    getSiteSettings(),
  ]);
  if (!data) notFound();
  const query = await searchParams;
  const editing = query.editStory ? data.memories.find(item => item.id === query.editStory) : undefined;
  if (query.editStory && !editing) notFound();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回去过的地方</Link>
    <div className="admin-page-heading"><p className="eyebrow">VISITED / OUR MEMORIES</p><h1>{data.name}</h1><p>{data.region} · {data.whenLabel || data.memories.find(story => story.happenedAt)?.happenedAt?.toISOString().slice(0, 10) || "到访日期待补充"}</p></div>
    {query.created === "1" ? <p className="form-success" role="status">地点已创建，故事和照片可以继续在这里补充。</p> : null}
    {query.saved === "1" ? <p className="form-success" role="status">地点资料已更新。</p> : null}
    {query.photo === "1" ? <p className="form-success" role="status">地点封面已更新。</p> : null}
    <div className="admin-links"><Link href={`/visited#place-${id}`}>查看公开地点 ↗</Link><a href="#place-stories">故事与相册 ↓</a><a href="#place-info">地点资料 ↓</a></div>
    <PlaceStories
      placeId={id} placeName={data.name} stories={data.memories}
      visibility={settings.visibility} archived={data.isArchived}
      editing={editing ? { id: editing.id, title: editing.title, content: editing.content,
        happenedAt: editing.happenedAt?.toISOString().slice(0, 10) ?? "", photoCount: editing.photos.length } : undefined}
      saved={query.storySaved === "1"} deleted={query.storyDeleted === "1"} photoDeleted={query.photoDeleted === "1"}
    />
    <details className="admin-disclosure place-more-options" id="place-info">
      <summary>地点信息、封面与地图设置</summary>
      <div className="place-settings">
        <CoverUploadForm id={id} kind="place" imageUrl={getPlaceImageUrl(data.image)} />
        <PlaceEditForm data={data} groupLabels={getGroupLabels(settings)} />
        <RecordArchiveForm key={String(data.isArchived)} id={id} kind="place" isArchived={data.isArchived} relatedCount={data._count.timeline + data._count.memories} />
      </div>
    </details>
  </main>;
}
