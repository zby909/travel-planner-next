import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "计划中",
  BOOKED: "已预订",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

// 汇总两个人的旅行计划和已关联的外部攻略数量。
export default async function AdminTravelPlans({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireEditor();
  const [plans, query] = await Promise.all([
    prisma.travelPlan.findMany({
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      include: { destination: { select: { title: true } }, _count: { select: { guides: true, expenses: true } } },
    }),
    searchParams,
  ]);
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">出行计划</p><h1>旅行计划</h1><p>管理即将出发和已经完成的旅程，随手记录预算、四类花销与外部参考攻略链接（如小红书、Notion、博客或自托管攻略页）。</p></div>
    {query.deleted === "1" ? <p className="form-success" role="status">旅行计划已删除；外部网页链接没有受到影响。</p> : null}
    <div className="admin-links"><Link href="/admin/plans/new">＋ 创建旅行计划</Link></div>
    {plans.length ? <div className="plan-list">{plans.map(plan => (
      <Link className="plan-card" href={`/admin/plans/${plan.id}`} key={plan.id}>
        <div className="plan-card-top"><span className="eyebrow">{plan.startDate ? formatDate(plan.startDate) : "日期待定"}{plan.endDate ? ` — ${formatDate(plan.endDate)}` : ""}</span><span className={`plan-status plan-status-${plan.status.toLowerCase()}`}>{STATUS_LABELS[plan.status] ?? plan.status}</span></div>
        <h2>{plan.title}</h2>
        <p>{plan.destination?.title ?? "尚未关联目的地"}{plan.notes ? ` · ${plan.notes}` : ""}</p>
        <div className="plan-card-footer"><span>{plan._count.guides} 份攻略链接 · {plan._count.expenses} 条费用记录</span><strong>{plan.plannedBudget === null ? "预算待定" : formatMoney(plan.plannedBudget, plan.currency)} <span>编辑 ↗</span></strong></div>
      </Link>
    ))}</div> : <section className="empty-state"><h3>还没有旅行计划</h3><p>先创建一趟即将出发的旅程，记录日期、预算和参考攻略，回来后一键转成足迹手记。</p><Link className="button button-dark" href="/admin/plans/new">创建第一趟旅行</Link></section>}
  </main>;
}
