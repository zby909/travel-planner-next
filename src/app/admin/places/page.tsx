import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";

const groupLabels: Record<string, string> = { both: "我们都去过", her: "王颖单独去过", mine: "我单独去过" };
export default async function AdminPlaces() {
  await requireEditor();
  const places = await prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" } });
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">PLACE ATLAS</p><h1>旅行足迹地点</h1><p>修改地点名称、到访分类和时间备注。地图坐标与时间轴关联保持原状。</p></div>
    <div className="admin-list">{places.map(place => (
      <Link className="admin-list-item" href={`/admin/places/${place.id}`} key={place.id}>
        <div><strong>{place.name}</strong><span>{place.region} · {groupLabels[place.group]}</span></div>
        <div><span>{place.whenLabel || "无月份记录"}</span><span>编辑 ↗</span></div>
      </Link>
    ))}</div>
  </main>;
}
