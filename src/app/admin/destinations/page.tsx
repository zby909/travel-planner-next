import Link from "next/link";
import { formatCny } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";

export default async function AdminDestinations() {
  await requireEditor();
  const items = await prisma.destination.findMany({ orderBy: { rank: "asc" } });
  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">DESTINATION MANAGEMENT</p><h1>目的地与预算</h1><p>选择一个目的地编辑预算组成、推荐月份和机票规划。更新后公开页面同步显示。</p></div>
      <div className="admin-list">{items.map(item => (
        <Link key={item.id} href={`/admin/destinations/${item.id}`} className="admin-list-item">
          <div><strong>{item.title}</strong><span>{item.subtitle} · {item.months}</span></div>
          <div><b>{formatCny(item.pickBudget)}</b><span>双人基准预算 · 编辑 ↗</span></div>
        </Link>
      ))}</div>
    </main>
  );
}
