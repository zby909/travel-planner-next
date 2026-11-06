import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { deleteTimelineAction } from "./actions";
import { DeleteTimelineButton, TimelineForm } from "./timeline-form";

type PageProps = { searchParams: Promise<{ edit?: string; new?: string; saved?: string; deleted?: string }> };

// 管理公开旅行时间轴，并维护事件与足迹地点之间的关联。
export default async function AdminTimelinePage({ searchParams }: PageProps) {
  await requireEditor();
  const query = await searchParams;
  const [entries, places, settings] = await Promise.all([
    prisma.timelineEntry.findMany({
      orderBy: [{ year: "desc" }, { sortOrder: "asc" }],
      include: { places: { orderBy: { sortOrder: "asc" }, include: { place: { select: { id: true, name: true, region: true, isArchived: true } } } } },
    }),
    prisma.visitedPlace.findMany({ select: { id: true, name: true, region: true, group: true, isArchived: true }, orderBy: { sortOrder: "asc" } }),
    getSiteSettings(),
  ]);
  const editing = query.edit ? entries.find(entry => entry.id === query.edit) : null;
  if (query.edit && !editing) notFound();
  const groupLabels = getGroupLabels(settings);
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">TRAVEL CHRONICLE</p><h1>旅行时间轴</h1><p>把某次旅行、某个阶段或值得记住的日子整理成事件，并关联对应足迹。保存后会同步到公开足迹页面。</p></div>
    {query.saved === "1" ? <p className="form-success" role="status">时间记录已保存。</p> : null}
    {query.deleted === "1" ? <p className="form-success" role="status">时间记录已删除。</p> : null}
    {editing ? <section className="admin-panel">
      <div className="timeline-editor-heading"><div><p className="eyebrow">EDIT ENTRY</p><h2>编辑时间记录</h2></div><Link className="admin-back" href="/admin/timeline">取消编辑</Link></div>
      <TimelineForm places={places} groupLabels={groupLabels} initial={{
        id: editing.id, date: editing.date, year: editing.year, group: editing.group,
        title: editing.title, note: editing.note, placeIds: editing.places.map(item => item.placeId),
      }} />
    </section> : <details className="admin-disclosure" open={entries.length === 0 || query.new === "1"}>
      <summary>＋ 新增一条时间记录</summary>
      <section className="admin-panel"><TimelineForm places={places} groupLabels={groupLabels} /></section>
    </details>}
    <section className="admin-panel admin-records">
      <div className="timeline-editor-heading"><div><h2>已有记录</h2><p className="muted-copy">共 {entries.length} 条，按年份整理。</p></div><Link href="/visited#timeline" className="source-link">查看公开时间轴 ↗</Link></div>
      {entries.length ? <div className="admin-list">{entries.map(entry => (
        <article className="admin-list-item timeline-admin-item" key={entry.id}>
          <div>
            <strong>{entry.title}</strong>
            <span>{entry.date} · {entry.year} · {groupLabels[entry.group as keyof typeof groupLabels] ?? "已到访"}</span>
            {entry.note ? <p>{entry.note}</p> : null}
            <span>{entry.places.length ? entry.places.map(item => item.place.name + (item.place.isArchived ? "（已归档）" : "")).join("、") : "尚未关联足迹地点"}</span>
          </div>
          <div className="timeline-admin-actions">
            <Link href={`/admin/timeline?edit=${encodeURIComponent(entry.id)}`}>编辑</Link>
            <form action={deleteTimelineAction}><input type="hidden" name="id" value={entry.id} /><DeleteTimelineButton /></form>
          </div>
        </article>
      ))}</div> : <div className="empty-state"><h3>还没有时间记录</h3><p>可以从第一次旅行、重要纪念日或最近一次出发开始添加。</p></div>}
    </section>
  </main>;
}
