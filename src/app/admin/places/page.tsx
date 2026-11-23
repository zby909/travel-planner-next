import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { getVisitDate, latestPlaceVisit, placeVisitGroups, visitDateSelect } from "@/lib/place-visits";
import { assignStoryPlaceAction } from "./story-actions";
// 按地点检索，列表展现到访次数与最近记录。
export default async function AdminPlaces({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  await requireEditor();
  const query = await searchParams;
  const isArchived = query.view === "archived";
  const term = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const [places, settings, unassigned, timelineCount] = await Promise.all([
    prisma.visitedPlace.findMany({ where: { isArchived, ...(term ? { OR: [
      { name: { contains: term } }, { region: { contains: term } }, { country: { contains: term } }, { province: { contains: term } }, { city: { contains: term } },
    ] } : {}) }, orderBy: { sortOrder: "asc" },
    include: { visits: { where: { deletedAt: null }, select: visitDateSelect } } }),
    getSiteSettings(),
    prisma.travelMemory.findMany({ where: { placeId: null, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, happenedAt: true, whenLabel: true } }),
    prisma.timelineEntry.count(),
  ]);
  const activePlaces = unassigned.length
    ? (!isArchived && !term
      ? places.map(({ id, name, region }) => ({ id, name, region }))
      : await prisma.visitedPlace.findMany({ where: { isArchived: false }, select: { id: true, name: true, region: true }, orderBy: { sortOrder: "asc" } }))
    : [];
  const groupLabels = getGroupLabels(settings);
  return <main>
    <div className="admin-page-heading"><h1>去过的地方</h1><p>按地点整理每一次到访的手记与照片。</p></div>
    <div className="admin-links"><Link href="/admin/places/new">＋ 记录一个去过的地方</Link><Link aria-current={!isArchived ? "page" : undefined} href="/admin/places">展示中</Link><Link aria-current={isArchived ? "page" : undefined} href="/admin/places?view=archived">已归档</Link></div>
    <form action="/admin/places" className="place-search" role="search">
      {isArchived ? <input type="hidden" name="view" value="archived" /> : null}
      <input type="search" name="q" maxLength={100} defaultValue={term} aria-label="搜索地点或地区" placeholder="搜索地点或地区" />
      <button className="button button-dark" type="submit">搜索</button>
      {term ? <Link href={isArchived ? "/admin/places?view=archived" : "/admin/places"}>清除</Link> : null}
    </form>
    {isArchived ? <p className="muted-copy">以下足迹及关联故事暂停展示，打开后可恢复。</p> : null}
    <div className="admin-list">{places.length === 0 ? <p className="muted-copy">{term ? "没有找到匹配的地点。" : isArchived ? "还没有归档的地点。" : "还没有足迹地点，可以先新增一条记录。"}</p> : places.map(place => {
      const latest = latestPlaceVisit(place.visits);
      const groups = placeVisitGroups(place.visits).map(group => groupLabels[group]);
      return <Link className="admin-list-item" href={`/admin/places/${encodeURIComponent(place.id)}`} key={place.id}>
        <div><strong>{place.name}</strong><span>{[place.region, ...groups].join(" · ")}</span></div>
        <div><span>{place.visits.length} 次到访{latest ? ` · ${getVisitDate(latest).label}` : ""}</span><span>管理到访 ↗</span></div>
      </Link>
    })}</div>
    {unassigned.length ? <section className="admin-panel place-unassigned">
      <h2>待归类的旧手记 <span className="admin-panel-count">{unassigned.length}</span></h2>
      <p className="muted-copy">归入地点后，原手记和照片会作为独立的一次到访保留。</p>
      {unassigned.map(story => <form action={assignStoryPlaceAction} key={story.id} className="place-assign-row">
        <input type="hidden" name="storyId" value={story.id} />
        <span><strong>{story.title}</strong><small>{getVisitDate(story).label}</small></span>
        <select name="placeId" aria-label={`将 ${story.title} 归入地点`} required defaultValue="">
          <option value="" disabled>选择去过的地方</option>
          {activePlaces.map(place => <option key={place.id} value={place.id}>{place.name} · {place.region}</option>)}
        </select>
        <button className="button button-dark" type="submit" disabled={!activePlaces.length}>归入地点</button>
      </form>)}
    </section> : null}
    <p className="muted-copy">管理 {timelineCount} 条<Link href="/admin/timeline">独立时间轴事件</Link>。</p>
  </main>;
}
