import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";

// 汇总核心内容数量与轻量化待办，优先突出记录新旅程与邀请伴侣。
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [user, query] = await Promise.all([requireEditor(), searchParams]);
  const isAdmin = user.role === "ADMIN";
  const [destinations, plans, places, visitsCount, placesWithoutCoordinates, history, siteNameSetting, memberCount, settings] = await Promise.all([
    prisma.destination.findMany({
      where: { isArchived: false },
      select: { id: true, title: true, imagePath: true },
      orderBy: { rank: "asc" },
    }),
    prisma.travelPlan.count(),
    prisma.visitedPlace.count({ where: { isArchived: false } }),
    prisma.travelMemory.count({ where: { deletedAt: null, place: { isArchived: false } } }),
    prisma.visitedPlace.findMany({
      where: { isArchived: false, OR: [{ latitude: null }, { longitude: null }] },
      select: { id: true, name: true, region: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { displayName: true } } } }),
    isAdmin ? prisma.appSetting.findUnique({ where: { key: "siteName" }, select: { key: true } }) : Promise.resolve(null),
    isAdmin ? prisma.user.count({ where: { isActive: true } }) : Promise.resolve(0),
    getSiteSettings(),
  ]);
  const onboardingItems = [
    ...(user.role === "ADMIN" ? [
      { label: "设置旅行空间名称和两位成员昵称", done: Boolean(siteNameSetting), href: "/admin/settings", action: "去设置" },
      { label: "邀请另一半加入共同记录", done: memberCount >= 2, href: "/admin/users", action: "生成邀请链接" },
    ] : []),
    { label: "记下你们去过的第一个地方", done: places > 0 || destinations.length > 0, href: "/admin/places/new", action: "记录旅行" },
  ];
  const onboardingProgress = onboardingItems.filter(item => item.done).length;
  const attentionItems = [
    ...placesWithoutCoordinates.map(place => ({
      label: `${place.name} · 在地图上标注位置`,
      href: `/admin/places/${encodeURIComponent(place.id)}#place-info`,
    })),
    ...destinations
      .filter(item => item.imagePath?.includes("placeholder"))
      .map(item => ({
        label: `${item.title} · 换一张喜欢的封面图`,
        href: `/admin/destinations/${encodeURIComponent(item.id)}`,
      })),
  ];

  return (
    <main>
      <div className="admin-page-heading"><p className="eyebrow">编辑室</p><h1>{user.displayName}，欢迎回来。</h1><p>随手记下刚去过的风景、上传相片，或收藏下一次想一起出发的地方。</p></div>
      {query.welcome === "1" ? <p className="form-success" role="status">空间已就绪！现在就可以记录第一段旅行，或去「成员与邀请」邀请另一半加入。</p> : null}
      <div className="admin-stats">
        <Link href="/admin/places"><strong>{places}</strong><span>去过的地方 →</span></Link>
        <Link href="/admin/places"><strong>{visitsCount}</strong><span>累计到访手记 →</span></Link>
        <Link href="/admin/destinations"><strong>{destinations.length}</strong><span>想去的心愿地 →</span></Link>
        <Link href="/admin/plans"><strong>{plans}</strong><span>出行计划 →</span></Link>
      </div>
      {onboardingProgress < onboardingItems.length ? (
        <section className="admin-panel">
          <div className="timeline-editor-heading">
            <div><p className="eyebrow">新空间引导</p><h2>几步布置好你们的旅行空间</h2></div>
            <span className="admin-panel-count">{onboardingProgress}/{onboardingItems.length}</span>
          </div>
          <p className="muted-copy">当前空间为{settings.visibility === "PUBLIC" ? "公开展示" : "仅你们两个人可见"}{isAdmin ? "，随时可在「站点设置」切换" : ""}。</p>
          <ul className="admin-attention-list">
            {onboardingItems.map(item => (
              <li key={item.href}><Link href={item.href}><span>{item.done ? "✓" : "○"} {item.label}</span><strong>{item.done ? "已完成" : item.action + " ↗"}</strong></Link></li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <h2>快捷记录</h2>
          <div className="admin-links">
            <Link href="/admin/places/new">＋ 记一次新旅行（写手记 / 传照片）</Link>
            <Link href="/admin/destinations/new">＋ 收藏一个想去的地方</Link>
            <Link href="/admin/plans/new">＋ 新建一趟出行计划</Link>
            <Link href="/admin/places">＋ 整理已有足迹与相册</Link>
          </div>
        </section>
        <section className="admin-panel">
          <h2>轻提醒 <span className="admin-panel-count">{attentionItems.length}</span></h2>
          {attentionItems.length ? <>
            <ul className="admin-attention-list">{attentionItems.slice(0, 6).map(item => <li key={item.href + item.label}><Link href={item.href}>{item.label}<strong>去处理 ↗</strong></Link></li>)}</ul>
            {attentionItems.length > 6 ? <p className="muted-copy">还有 {attentionItems.length - 6} 项可按需补充，不影响前台展示。</p> : null}
          </> : <p className="muted-copy">地图位置和封面都整理得很完整，随时出发去下一个地方吧。</p>}
        </section>
        <section className="admin-panel admin-history-panel">
          <h2>最近动态</h2>
          {history.length ? <ul className="audit-list">{history.map(item => <li key={item.id}><span>{item.actor.displayName} · {item.action} {item.entity}</span><strong>{item.summary}</strong><small>{item.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></li>)}</ul> : <p className="muted-copy">还没有编辑动态。</p>}
        </section>
      </div>
    </main>
  );
}
