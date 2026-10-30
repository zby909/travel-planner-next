import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";

export default async function AdminHome() {
  const user = await requireEditor();
  const [destinations, flights, places, timeline, history] = await Promise.all([
    prisma.destination.count(),
    prisma.flightPriceSample.count(),
    prisma.visitedPlace.count(),
    prisma.timelineEntry.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { displayName: true } } } }),
  ]);
  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">OUR TRAVEL JOURNAL</p><h1>{user.displayName}，欢迎回来。</h1><p>在这里一起维护想去的地方，以及两个人共同或各自走过的足迹。</p></div>
      <div className="admin-stats">
        <Link href="/admin/destinations"><strong>{destinations}</strong><span>共同心愿目的地 →</span></Link>
        <Link href="/admin/flights"><strong>{flights}</strong><span>机票报价记录 →</span></Link>
        <Link href="/admin/places"><strong>{places}</strong><span>已经去过的地方 →</span></Link>
        <div><strong>{timeline}</strong><span>旅行时间记录</span></div>
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <h2>常用操作</h2>
          <div className="admin-links">
            <Link href="/admin/flights">＋ 添加一条机票价格样本</Link>
            <Link href="/admin/destinations/new">＋ 新增旅行目的地</Link>
            <Link href="/admin/places/new">＋ 新增已到访地点</Link>
            <Link href="/admin/destinations">编辑旅行预算和目的地信息</Link>
            <Link href="/admin/places">修改足迹地点和到访时间</Link>
            {user.role === "ADMIN" ? <Link href="/admin/settings">配置站点品牌、成员名称和币种</Link> : null}
          </div>
          <p className="muted-copy">可以直接新增和维护目的地、足迹与机票样本。照片可通过 AI 导入，站点品牌、成员名称和默认预算币种由管理员统一配置。</p>
        </section>
        <section className="admin-panel">
          <h2>最近编辑记录</h2>
          {history.length ? <ul className="audit-list">{history.map(item => <li key={item.id}><span>{item.actor.displayName} · {item.action} {item.entity}</span><strong>{item.summary}</strong><small>{item.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></li>)}</ul> : <p className="muted-copy">还没有后台修改记录。</p>}
        </section>
      </div>
    </main>
  );
}
