import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
// 归档列表与展示中足迹分开，仍保留原始数据和编辑入口。
export default async function AdminPlaces({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireEditor();
  const isArchived = (await searchParams).view === "archived";
  const [places, settings] = await Promise.all([
    prisma.visitedPlace.findMany({ where: { isArchived }, orderBy: { sortOrder: "asc" } }),
    getSiteSettings(),
  ]);
  const groupLabels = getGroupLabels(settings);
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">PLACE ATLAS</p><h1>旅行足迹地点</h1><p>修改地点名称、到访分类和时间备注。地图坐标与时间轴关联保持原状。</p></div>
    <div className="admin-links"><Link href="/admin/places/new">＋ 新增足迹地点</Link><Link aria-current={!isArchived ? "page" : undefined} href="/admin/places">展示中</Link><Link aria-current={isArchived ? "page" : undefined} href="/admin/places?view=archived">已归档</Link></div>
    {isArchived ? <p className="muted-copy">以下足迹及关联故事暂停展示，打开后可恢复。</p> : null}
    <div className="admin-list">{places.length === 0 ? <p className="muted-copy">还没有足迹地点，可以先新增一条记录。</p> : places.map(place => (
      <Link className="admin-list-item" href={`/admin/places/${place.id}`} key={place.id}>
        <div><strong>{place.name}</strong><span>{place.region} · {groupLabels[place.group as keyof typeof groupLabels] ?? "已到访"}</span></div>
        <div><span>{place.whenLabel || "无日期记录"}</span><span>编辑 ↗</span></div>
      </Link>
    ))}</div>
  </main>;
}
