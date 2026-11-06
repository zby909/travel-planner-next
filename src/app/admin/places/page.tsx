import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { assignStoryPlaceAction } from "./story-actions";
// 归档列表与展示中足迹分开，仍保留原始数据和编辑入口。
export default async function AdminPlaces({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireEditor();
  const isArchived = (await searchParams).view === "archived";
  const [places, settings, unassigned, activePlaces, timelineCount] = await Promise.all([
    prisma.visitedPlace.findMany({ where: { isArchived }, orderBy: { sortOrder: "asc" },
      include: { memories: { select: { id: true, _count: { select: { photos: true } } } } } }),
    getSiteSettings(),
    prisma.travelMemory.findMany({ where: { placeId: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, happenedAt: true } }),
    prisma.visitedPlace.findMany({ where: { isArchived: false }, select: { id: true, name: true, region: true }, orderBy: { sortOrder: "asc" } }),
    prisma.timelineEntry.count(),
  ]);
  const groupLabels = getGroupLabels(settings);
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">PLACES / STORIES / PHOTOS</p><h1>去过的地方</h1><p>一个地点里管理到访时间、故事和照片。重新到访同一个地方，继续添加故事即可。</p></div>
    <div className="admin-links"><Link href="/admin/places/new">＋ 记录一个去过的地方</Link><Link aria-current={!isArchived ? "page" : undefined} href="/admin/places">展示中</Link><Link aria-current={isArchived ? "page" : undefined} href="/admin/places?view=archived">已归档</Link></div>
    {isArchived ? <p className="muted-copy">以下足迹及关联故事暂停展示，打开后可恢复。</p> : null}
    <div className="admin-list">{places.length === 0 ? <p className="muted-copy">还没有足迹地点，可以先新增一条记录。</p> : places.map(place => (
      <Link className="admin-list-item" href={`/admin/places/${place.id}`} key={place.id}>
        <div><strong>{place.name}</strong><span>{place.region} · {groupLabels[place.group as keyof typeof groupLabels] ?? "已到访"}</span></div>
        <div><span>{place.whenLabel || "日期待补充"} · {place.memories.length} 篇故事 · {place.memories.reduce((sum, memory) => sum + memory._count.photos, 0)} 张照片</span><span>记录故事与相册 ↗</span></div>
      </Link>
    ))}</div>
    {unassigned.length ? <section className="admin-panel place-unassigned">
      <h2>待整理的旧故事 <span className="admin-panel-count">{unassigned.length}</span></h2>
      <p className="muted-copy">旧版没有关联地点的日记和照片都还保留着。选择实际去过的地点，就能合并到新的故事与相册中；不会删除原照片。</p>
      {unassigned.map(story => <form action={assignStoryPlaceAction} key={story.id} className="place-assign-row">
        <input type="hidden" name="storyId" value={story.id} />
        <span><strong>{story.title}</strong><small>{story.happenedAt?.toISOString().slice(0, 10) ?? "日期待补充"}</small></span>
        <select name="placeId" aria-label={`将 ${story.title} 归入地点`} required defaultValue="">
          <option value="" disabled>选择去过的地方</option>
          {activePlaces.map(place => <option key={place.id} value={place.id}>{place.name} · {place.region}</option>)}
        </select>
        <button className="button button-dark" type="submit" disabled={!activePlaces.length}>归入地点</button>
      </form>)}
    </section> : null}
    {timelineCount > 0 ? <p className="muted-copy">原先单独录入的 {timelineCount} 条时间记录仍然保留。需要修改时可进入<Link href="/admin/timeline">旧时间记录</Link>；以后新故事的日期会自动进入足迹时间轴。</p> : null}
  </main>;
}
