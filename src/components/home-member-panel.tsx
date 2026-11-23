import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import styles from "./home-member-panel.module.css";

type RecentVisitLink = { id: string; placeId: string; placeName: string };

// 仅在成员登录后查询即将出发的旅行计划，并复用首页已读取的最近编辑到访。
export async function HomeMemberPanel({ name, latestVisit }: { name: string; latestVisit?: RecentVisitLink | null }) {
  const plan = await prisma.travelPlan.findFirst({
    where: {
      status: { in: ["PLANNED", "BOOKED"] },
      startDate: { gte: new Date(new Date().toISOString().slice(0, 10)) },
    },
    orderBy: { startDate: "asc" },
    select: { id: true, title: true, startDate: true },
  });
  return <aside className={`page-width ${styles.panel}`} aria-label="成员快捷入口">
    <p>{name}，欢迎回来。</p>
    {plan ? <Link href={`/admin/plans/${encodeURIComponent(plan.id)}`}><small>下一次出发 · {formatDate(plan.startDate)}</small><strong>{plan.title} ↗</strong></Link> : <Link href="/admin/plans/new"><small>下一次出发</small><strong>安排一趟旅行 ↗</strong></Link>}
    <Link href={latestVisit ? `/admin/places/${encodeURIComponent(latestVisit.placeId)}?visit=${encodeURIComponent(latestVisit.id)}#place-journal` : "/admin/places/new"}>
      <small>{latestVisit ? "继续整理" : "开始记录"}</small><strong>{latestVisit?.placeName ?? "留下第一枚足迹"} ↗</strong>
    </Link>
  </aside>;
}
