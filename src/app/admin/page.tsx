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
      <div className="admin-page-heading"><p className="eyebrow">PRIVATE WORKSPACE</p><h1>{user.displayName}，欢迎回来。</h1><p>这里的修改会立即写入 SQLite 数据库，公开页面随后读取最新内容。</p></div>
      <div className="admin-stats">
        <Link href="/admin/destinations"><strong>{destinations}</strong><span>未来目的地 →</span></Link>
        <Link href="/admin/flights"><strong>{flights}</strong><span>机票报价记录 →</span></Link>
        <Link href="/admin/places"><strong>{places}</strong><span>旅行与生活足迹 →</span></Link>
        <div><strong>{timeline}</strong><span>时间轴记录</span></div>
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <h2>常用操作</h2>
          <div className="admin-links">
            <Link href="/admin/flights">＋ 添加一条机票价格样本</Link>
            <Link href="/admin/destinations">编辑旅行预算和目的地信息</Link>
            <Link href="/admin/places">修改足迹地点和到访时间</Link>
          </div>
          <p className="muted-copy">目前先提供目的地、机票报价和地点的管理。旅行照片上传、多人共享心动清单和实际开销表单仍属于后续迭代。</p>
        </section>
        <section className="admin-panel">
          <h2>最近编辑记录</h2>
          {history.length ? <ul className="audit-list">{history.map(item => <li key={item.id}><span>{item.actor.displayName} · {item.action} {item.entity}</span><strong>{item.summary}</strong><small>{item.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></li>)}</ul> : <p className="muted-copy">还没有后台修改记录。</p>}
        </section>
      </div>
    </main>
  );
}
