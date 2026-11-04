import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { parseJsonArray } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";

// 汇总内容数量和待完善项，让工作台优先呈现下一步可执行的操作。
export default async function AdminHome() {
  const user = await requireEditor();
  const [destinations, flights, plans, places, placesWithoutCoordinates, timeline, history, siteNameSetting, memberCount, settings] = await Promise.all([
    prisma.destination.findMany({
      select: { id: true, title: true, imagePath: true, routeJson: true, guide: { select: { destinationId: true } } },
      orderBy: { rank: "asc" },
    }),
    prisma.flightPriceSample.count(),
    prisma.travelPlan.count(),
    prisma.visitedPlace.count(),
    prisma.visitedPlace.findMany({
      where: { OR: [{ latitude: null }, { longitude: null }] },
      select: { id: true, name: true, region: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.timelineEntry.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { displayName: true } } } }),
    prisma.appSetting.findUnique({ where: { key: "siteName" }, select: { key: true } }),
    prisma.user.count(),
    getSiteSettings(),
  ]);
  const onboardingItems = [
    { label: "设置旅行空间名称和两位成员昵称", done: Boolean(siteNameSetting), href: "/admin/settings", action: "去设置" },
    { label: "为另一半创建独立登录账号", done: memberCount >= 2, href: "/admin/users", action: "创建账号" },
    { label: "添加第一条心愿目的地或到访足迹", done: destinations.length > 0 || places > 0, href: "/admin/destinations/new", action: "开始记录" },
  ];
  const onboardingProgress = onboardingItems.filter(item => item.done).length;
  const attentionItems = [
    ...destinations.flatMap(item => [
      ...(!item.guide ? [{ label: `${item.title} · 补充每日攻略`, href: `/admin/destinations/${item.id}` }] : []),
      ...(parseJsonArray<string>(item.routeJson).length === 0 ? [{ label: `${item.title} · 整理旅行路线`, href: `/admin/destinations/${item.id}` }] : []),
      ...(item.imagePath?.includes("placeholder") ? [{ label: `${item.title} · 更换目的地封面`, href: `/admin/destinations/${item.id}` }] : []),
    ]),
    ...placesWithoutCoordinates.map(place => ({
      label: `${place.name} · 补充地图坐标`,
      href: `/admin/places/${place.id}`,
    })),
  ];

  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">OUR TRAVEL JOURNAL</p><h1>{user.displayName}，欢迎回来。</h1><p>先处理需要完善的内容，再继续记录下一段旅程。</p></div>
      <div className="admin-stats">
        <Link href="/admin/destinations"><strong>{destinations.length}</strong><span>心愿目的地 →</span></Link>
        <Link href="/admin/places"><strong>{places}</strong><span>已到访地点 →</span></Link>
        <Link href="/admin/timeline"><strong>{timeline}</strong><span>旅行时间记录 →</span></Link>
        <Link href="/admin/plans"><strong>{plans}</strong><span>旅行计划 →</span></Link>
        <Link href="/admin/flights"><strong>{flights}</strong><span>机票价格样本 →</span></Link>
      </div>
      {onboardingProgress < onboardingItems.length ? (
        <section className="admin-panel">
          <div className="timeline-editor-heading">
            <div><p className="eyebrow">FIRST STEPS / 01</p><h2>先布置好你们的旅行空间</h2></div>
            <span className="admin-panel-count">{onboardingProgress}/{onboardingItems.length}</span>
          </div>
          <p className="muted-copy">完成几个简单设置，就可以开始共同记录。当前站点为{settings.visibility === "PUBLIC" ? "公开展示" : "仅成员可见"}，随时可以在站点设置中切换。</p>
          <ul className="admin-attention-list">
            {onboardingItems.map(item => (
              <li key={item.href}><Link href={item.href}><span>{item.done ? "✓" : "○"} {item.label}</span><strong>{item.done ? "已完成" : item.action + " ↗"}</strong></Link></li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <h2>快速新增</h2>
          <div className="admin-links">
            <Link href="/admin/destinations/new">＋ 新增心愿目的地</Link>
            <Link href="/admin/places/new">＋ 记录一个到访地点</Link>
            <Link href="/admin/timeline?new=1">＋ 写下一条旅行时间记录</Link>
            <Link href="/admin/plans/new">＋ 创建旅行计划</Link>
            <Link href="/admin/plans">＋ 管理旅行计划与日记</Link>
            <Link href="/admin/flights?new=1">＋ 保存一条机票价格样本</Link>
          </div>
        </section>
        <section className="admin-panel">
          <h2>内容待完善 <span className="admin-panel-count">{attentionItems.length}</span></h2>
          {attentionItems.length ? <>
            <ul className="admin-attention-list">{attentionItems.slice(0, 8).map(item => <li key={item.href + item.label}><Link href={item.href}>{item.label}<strong>去完善 ↗</strong></Link></li>)}</ul>
            {attentionItems.length > 8 ? <p className="muted-copy">还有 {attentionItems.length - 8} 项待完善，列表页也会标出对应状态。</p> : null}
          </> : <p className="muted-copy">目前没有明显缺项，内容整理得不错。可以继续添加新的旅行记录。</p>}
        </section>
        <section className="admin-panel admin-history-panel">
          <h2>最近编辑记录</h2>
          {history.length ? <ul className="audit-list">{history.map(item => <li key={item.id}><span>{item.actor.displayName} · {item.action} {item.entity}</span><strong>{item.summary}</strong><small>{item.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></li>)}</ul> : <p className="muted-copy">还没有后台修改记录。</p>}
        </section>
      </div>
    </main>
  );
}
