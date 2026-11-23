import Link from "next/link";
import { formatMoney, parseJsonArray } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";

// 按展示中或已归档分开管理，归档内容仍可打开编辑和恢复。
export default async function AdminDestinations({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireEditor();
  const isArchived = (await searchParams).view === "archived";
  const items = await prisma.destination.findMany({
    where: { isArchived },
    select: {
      id: true, title: true, subtitle: true, months: true, routeJson: true, imagePath: true,
      pickBudget: true, currency: true, guide: { select: { destinationId: true } },
    },
    orderBy: { rank: "asc" },
  });
  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">心愿目的地</p><h1>想去的地方</h1><p>收藏下一次想一起出发的地方，封面、季节、预算和路线都可按需补充。</p></div>
      <div className="admin-links"><Link href="/admin/destinations/new">＋ 收藏新目的地</Link><Link aria-current={!isArchived ? "page" : undefined} href="/admin/destinations">展示中</Link><Link aria-current={isArchived ? "page" : undefined} href="/admin/destinations?view=archived">已归档</Link></div>
      {isArchived ? <p className="muted-copy">以下目的地已从首页下架，打开后可恢复展示。</p> : null}
      <div className="admin-list">{items.length === 0 ? <p className="muted-copy">{isArchived ? "还没有已归档的目的地。" : "还没有想去的地方，先收藏第一个吧。"}</p> : items.map(item => {
        const tags = [
          item.imagePath?.includes("placeholder") ? "默认封面" : "已设封面",
          ...(parseJsonArray(item.routeJson).length ? ["含路线"] : []),
          ...(item.guide ? ["含攻略"] : []),
        ];
        return (
        <Link key={item.id} href={`/admin/destinations/${encodeURIComponent(item.id)}`} className="admin-list-item">
          <div>
            <strong>{item.title}</strong>
            <span>{[item.subtitle, item.months].filter(Boolean).join(" · ")}</span>
            <span className="destination-admin-status">{tags.join(" · ")}</span>
          </div>
          <div><b>{item.pickBudget > 0 ? formatMoney(item.pickBudget, item.currency) : "预算待定"}</b><span>编辑 ↗</span></div>
        </Link>
        );
      })}</div>
    </main>
  );
}
