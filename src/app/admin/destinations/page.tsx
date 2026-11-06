import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { parseJsonArray } from "@/lib/format";

// 按展示中或已归档分开管理，归档内容仍可打开编辑和恢复。
export default async function AdminDestinations({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireEditor();
  const isArchived = (await searchParams).view === "archived";
  const [items, settings] = await Promise.all([
    prisma.destination.findMany({ where: { isArchived }, include: { guide: { select: { destinationId: true } } }, orderBy: { rank: "asc" } }),
    getSiteSettings(),
  ]);
  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">DESTINATION MANAGEMENT</p><h1>目的地与预算</h1><p>选择一个目的地编辑预算组成、推荐月份和旅行攻略。更新后公开页面同步显示。</p></div>
      <div className="admin-links"><Link href="/admin/destinations/new">＋ 新增目的地</Link><Link aria-current={!isArchived ? "page" : undefined} href="/admin/destinations">展示中</Link><Link aria-current={isArchived ? "page" : undefined} href="/admin/destinations?view=archived">已归档</Link></div>
      {isArchived ? <p className="muted-copy">以下目的地已从前台下架，打开后可恢复展示。</p> : null}
      <div className="admin-list">{items.length === 0 ? <p className="muted-copy">还没有目的地，可以先新增一条记录。</p> : items.map(item => (
        <Link key={item.id} href={`/admin/destinations/${item.id}`} className="admin-list-item">
          <div>
            <strong>{item.title}</strong>
            <span>{item.subtitle} · {item.months}</span>
            <span className="destination-admin-status">{[
              !item.guide ? "待补每日攻略" : "攻略已建立",
              parseJsonArray<string>(item.routeJson).length === 0 ? "待整理路线" : "路线已整理",
              item.imagePath?.includes("placeholder") ? "待上传封面" : "已有封面",
            ].join(" · ")}</span>
          </div>
          <div><b>{formatMoney(item.pickBudget, settings.currency)}</b><span>预算参考 · 编辑 ↗</span></div>
        </Link>
      ))}</div>
    </main>
  );
}
