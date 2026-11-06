import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";
import { formatDate } from "@/lib/format";
import { deleteTravelGuideLinkAction, deleteTravelPlanAction } from "../actions";
import {
  DeleteTravelGuideButton,
  DeleteTravelPlanButton,
  TravelGuideLinkForm,
  TravelPlanForm,
} from "../plan-forms";
import { TravelExpenseSection } from "../expense-section";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; guideSaved?: string; guideDeleted?: string; expenseSaved?: string; expenseDeleted?: string; editExpense?: string; editGuide?: string; newGuide?: string }>;
};

// 编辑旅行资料，并管理关联的整趟或单日 HTML 攻略入口。
export default async function TravelPlanDetailPage({ params, searchParams }: PageProps) {
  await requireEditor();
  const [{ id }, query, settings] = await Promise.all([params, searchParams, getSiteSettings()]);
  const [plan, destinations] = await Promise.all([
    prisma.travelPlan.findUnique({
      where: { id },
      include: {
        destination: { select: { title: true } },
        guides: { orderBy: [{ dayDate: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
        expenses: {
          orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, category: true, amountMinor: true, description: true, spentAt: true },
        },
      },
    }),
    prisma.destination.findMany({ select: { id: true, title: true, isArchived: true }, orderBy: { rank: "asc" } }).then(items => items.map(item => ({ id: item.id, title: item.title + (item.isArchived ? "（已归档）" : "") }))),
  ]);
  if (!plan) notFound();
  if (query.editExpense && !plan.expenses.some(item => item.id === query.editExpense)) notFound();
  const editingGuide = query.editGuide ? plan.guides.find(item => item.id === query.editGuide) : null;
  if (query.editGuide && !editingGuide) notFound();
  const guideInput = editingGuide ? {
    id: editingGuide.id,
    title: editingGuide.title,
    url: editingGuide.url,
    dayDate: editingGuide.dayDate?.toISOString().slice(0, 10) ?? "",
    coverImage: editingGuide.coverImage ?? "",
    description: editingGuide.description ?? "",
    sortOrder: editingGuide.sortOrder,
  } : undefined;
  return <main>
    <Link className="admin-back" href="/admin/plans">← 返回旅行计划</Link>
    <div className="admin-page-heading"><p className="eyebrow">JOURNEY EDITION / {plan.status}</p><h1>{plan.title}</h1><p>{plan.destination?.title ?? "尚未关联目的地"} · {plan.startDate ? formatDate(plan.startDate) : "日期待定"}{plan.endDate ? ` — ${formatDate(plan.endDate)}` : ""}</p></div>
    <nav className="plan-section-nav" aria-label="旅行计划模块">
      <a href="#plan-overview">基本信息</a>
      <a href="#plan-guides">HTML 攻略</a>
      <a href="#plan-expenses">旅行花费</a>
    </nav>
    {query.created === "1" ? <p className="form-success" role="status">旅行计划已创建，可以继续添加 AI HTML 攻略。</p> : null}
    {query.saved === "1" ? <p className="form-success" role="status">旅行计划资料已保存。</p> : null}
    {query.guideSaved === "1" ? <p className="form-success" role="status">攻略入口已保存。</p> : null}
    {query.guideDeleted === "1" ? <p className="form-success" role="status">攻略入口已移除，外部页面没有受到影响。</p> : null}
    <TravelPlanForm destinations={destinations} currency={settings.currency} initial={{
      id: plan.id,
      title: plan.title,
      destinationId: plan.destinationId,
      startDate: plan.startDate?.toISOString().slice(0, 10) ?? "",
      endDate: plan.endDate?.toISOString().slice(0, 10) ?? "",
      status: plan.status,
      plannedBudget: plan.plannedBudget,
       currencyLocked: plan.expenses.length > 0,
      currency: plan.currency,
      notes: plan.notes ?? "",
    }} />
    <TravelExpenseSection
      planId={plan.id}
      currency={plan.currency}
      plannedBudget={plan.plannedBudget}
      expenses={plan.expenses}
      saved={query.expenseSaved === "1"}
      deleted={query.expenseDeleted === "1"}
      editingExpenseId={query.editExpense}
    />
    <p className="muted-copy">旅行故事与照片请直接前往<Link href="/admin/places">「去过的地方」</Link>记录，不需要先创建旅行计划。</p>
    <section className="admin-panel plan-guides-section" id="plan-guides">
      <div className="timeline-editor-heading"><div><p className="eyebrow">EXTERNAL HTML GUIDES</p><h2>AI 旅行攻略</h2><p className="muted-copy">原始 HTML 保留在 Stack-Nest；这里管理入口，不上传文件、不做代理。</p></div><span className="admin-panel-count">{plan.guides.length}</span></div>
      {editingGuide ? <>
        <div className="plan-guide-form-heading"><h3>编辑攻略入口</h3><Link className="admin-back" href={`/admin/plans/${plan.id}`}>取消</Link></div>
        <TravelGuideLinkForm planId={plan.id} initial={guideInput} />
      </> : <details className="admin-disclosure" open={query.newGuide === "1" || plan.guides.length === 0}>
        <summary>＋ 添加一份 HTML 攻略</summary>
        <section className="admin-panel"><TravelGuideLinkForm planId={plan.id} /></section>
      </details>}
      {plan.guides.length ? <div className="plan-guide-list">{plan.guides.map(guide => (
        <article className="plan-guide-card" key={guide.id}>
          {guide.coverImage ? <Image className="plan-guide-cover" src={guide.coverImage} alt="" width={180} height={120} unoptimized /> : <div className="plan-guide-cover plan-guide-cover-empty"><span>HTML</span><small>TRAVEL GUIDE</small></div>}
          <div className="plan-guide-copy">
            <span className="eyebrow">{guide.dayDate ? formatDate(guide.dayDate) : "FULL JOURNEY"}</span>
            <h3>{guide.title}</h3>
            {guide.description ? <p>{guide.description}</p> : null}
            <span className="plan-guide-host">{new URL(guide.url).host}</span>
            <div className="plan-guide-actions"><a href={guide.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">打开原始攻略 ↗</a><Link href={`/admin/plans/${plan.id}?editGuide=${guide.id}`}>编辑入口</Link><form action={deleteTravelGuideLinkAction}><input type="hidden" name="id" value={guide.id} /><input type="hidden" name="planId" value={plan.id} /><DeleteTravelGuideButton /></form></div>
          </div>
        </article>
      ))}</div> : <p className="muted-copy">还没有关联攻略。你可以先用 AI 生成 HTML，再通过 Stack-Nest CLI 部署，然后把访问地址添加到这里。</p>}
    </section>
    <section className="admin-danger-zone"><div><strong>删除这趟旅行</strong><p>只删除本条计划、攻略入口和花费；已经记录的旅行故事与照片会保留在去过的地方。不会删除 Stack-Nest 上的 HTML 页面。</p></div><form action={deleteTravelPlanAction}><input type="hidden" name="id" value={plan.id} /><DeleteTravelPlanButton /></form></section>
  </main>;
}
