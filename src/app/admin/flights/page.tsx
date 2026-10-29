import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { formatCny, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { FlightCreateForm } from "@/components/admin-forms";
import { deleteFlightAction } from "@/app/admin/actions";
import { DeleteFlightButton } from "@/components/delete-flight-button";

const labels: Record<string, string> = {
  USER_REPORTED: "用户实际查询",
  PUBLIC_REFERENCE: "公开价格参考",
  HISTORICAL: "历史样本",
  PLANNING_ESTIMATE: "规划估算",
};

export default async function AdminFlights({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  await requireEditor();
  const [destinations, samples] = await Promise.all([
    prisma.destination.findMany({ select: { id: true, title: true }, orderBy: { rank: "asc" } }),
    prisma.flightPriceSample.findMany({ include: { destination: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">FLIGHT EVIDENCE</p><h1>机票报价记录</h1><p>记录真实查到的机票价格、来源和条件，不用新数据覆盖旧样本。</p></div>
    {(await searchParams).added === "1" ? <p className="form-success" role="status">机票报价已保存。</p> : null}
    <FlightCreateForm destinations={destinations} />
    <section className="admin-panel admin-records">
      <h2>历史样本（最近 {samples.length} 条）</h2>
      <div className="admin-list">
        {samples.length === 0 ? <p className="muted-copy">暂无报价样本。</p> : samples.map(item => (
          <article className="admin-list-item admin-list-sample" key={item.id}>
            <div>
              <strong>{item.route}</strong><span>{labels[item.sourceType] ?? item.sourceType} · {item.sourceName || "来源未记录"} · {item.destination?.title ?? "未关联目的地"}</span>
              <span>{formatDate(item.departureDate)}—{formatDate(item.returnDate)} · 查询 {formatDate(item.checkedAt)}</span>
              {item.notes ? <p>{item.notes}</p> : null}
              {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">查看原始报价来源 ↗</a> : null}
            </div>
            <div className="admin-record-right">
              <b>{item.totalPrice === null ? "两人总价未填写" : formatCny(item.totalPrice)}</b>
              <span>{item.pricePerPerson === null ? "人均价未填写" : `人均 ${formatCny(item.pricePerPerson)}`}</span>
              <form action={deleteFlightAction}>
                <input type="hidden" name="id" value={item.id} />
                <DeleteFlightButton />
              </form>
            </div>
          </article>
        ))}
      </div>
      <p className="muted-copy">删除报价不可撤销，但会保留一条操作审计记录。生产使用前建议备份数据库。</p>
      <Link href="/admin" className="source-link">← 返回管理首页</Link>
    </section>
  </main>;
}
