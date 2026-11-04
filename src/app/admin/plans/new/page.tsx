import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";
import { TravelPlanForm } from "../plan-forms";

// 创建旅行计划前加载可关联的心愿目的地和默认币种。
export default async function NewTravelPlanPage() {
  await requireEditor();
  const [destinations, settings] = await Promise.all([
    prisma.destination.findMany({ select: { id: true, title: true }, orderBy: { rank: "asc" } }),
    getSiteSettings(),
  ]);
  return <main>
    <Link className="admin-back" href="/admin/plans">← 返回旅行计划</Link>
    <div className="admin-page-heading"><p className="eyebrow">NEW JOURNEY</p><h1>计划下一趟旅行。</h1><p>先记录日期和预算，AI 生成的旅行攻略稍后可以通过 URL 添加。</p></div>
    <TravelPlanForm destinations={destinations} currency={settings.currency} />
  </main>;
}
