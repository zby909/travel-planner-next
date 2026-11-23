import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { formatMoney, parseJsonArray } from "@/lib/format";
import { getDestinationCoverUrl } from "@/lib/media";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteContentAccess, requireSiteContentAccess } from "@/lib/site-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// 仅在允许访问公开内容或已登录成员查看时返回目的地名称，避免私密模式泄露标题。
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const access = await getSiteContentAccess();
  if (!access.allowed) {
    return { title: "目的地计划｜我们的旅行手记" };
  }
  const { id } = await params;
  const [destination, settings] = await Promise.all([
    prisma.destination.findUnique({ where: { id, isArchived: false }, select: { title: true, subtitle: true } }),
    getSiteSettings(),
  ]);
  if (!destination) return { title: `想去的地方｜${settings.siteName}` };
  return {
    title: `${destination.title}｜${settings.siteName}`,
    description: `${destination.subtitle} · 路线灵感、出行季节与两人旅行预算。`,
  };
}

export default async function DestinationPage({ params }: PageProps) {
  const { id } = await params;
  await requireSiteContentAccess(`/destinations/${encodeURIComponent(id)}`);
  const [destination, settings] = await Promise.all([
    prisma.destination.findUnique({
      where: { id },
      include: {
        guide: { include: { days: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    getSiteSettings(),
  ]);
  if (!destination || destination.isArchived) notFound();

  const budget = [
    ["餐饮", destination.budgetFood],
    ["住宿", destination.budgetAccommodation],
    ["交通", destination.budgetTransport],
    ["其它", destination.budgetOther],
  ] as const;
  const route = parseJsonArray(destination.routeJson);
  const spots = parseJsonArray(destination.spotsJson);
  const types = parseJsonArray(destination.typesJson);
  const seasons = parseJsonArray(destination.seasonsJson).filter(Boolean);
  const encodedId = encodeURIComponent(destination.id);
  const hasBudget = destination.pickBudget > 0 || destination.minBudget > 0 || destination.maxBudget > 0;

  return (
    <div className="travel-detail">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <main>
      <TravelMotion />
      <section className="cinematic-story" aria-labelledby="story-cover-title">
        <Image className="cinematic-backdrop" unoptimized src={getDestinationCoverUrl(destination.id, destination.imagePath)} alt="" fill preload sizes="100vw" />
        <div className="cinematic-vignette" aria-hidden="true" />
        <div className="cinematic-story-inner page-width">
          <Link className="cinematic-story-back" href="/#destinations">← 返回所有目的地</Link>
          <div className="cinematic-story-content">
            <p className="cinematic-kicker"><span /> 想去的地方 · NO.{String(destination.rank).padStart(2, "0")}</p>
            <h1 id="story-cover-title">{destination.title}</h1>
            <p className="cinematic-story-subtitle">{destination.subtitle}</p>
            <p className="cinematic-story-vibe">{destination.vibe || "一段等待出发的旅程。"}</p>
          </div>
          <div className="cinematic-story-bottom"><span>未来的出发清单</span><span>{destination.subtitle}</span></div>
        </div>
      </section>
      <div className="story-keyfacts page-width" data-motion="rise">
        <div><span>推荐季节</span><strong>{destination.months || "待确定"}</strong></div>
        <div><span>建议天数</span><strong>{destination.days || "待规划"}</strong></div>
        <div><span>旅行风格</span><strong>{types.join(" · ") || destination.kind}</strong></div>
        <div><span>双人参考预算</span><strong>{destination.pickBudget ? formatMoney(destination.pickBudget, destination.currency) : "预算待估算"}</strong></div>
      </div>

      <section className="detail-layout page-width">
        <div className="detail-main" data-motion="rise">
          <p className="eyebrow">心动理由</p>
          <h2>去往远方的<em>一个理由。</em></h2>
          <p className="lead-copy">{destination.reason || "先收藏在这里，等挑一个好天气一起出发。"}</p>
          {!destination.imagePath && (
            <div className="cinematic-story-gallery" role="group" aria-label={`${destination.title}的旅行景观组图`}>
              <figure><Image src={`/api/legacy-media/images/${encodedId}-1.jpg`} alt={`${destination.title}的另一处风景`} fill unoptimized sizes="(max-width: 760px) 90vw, 31vw" /><figcaption>风景 · 02</figcaption></figure>
              <figure><Image src={`/api/legacy-media/images/${encodedId}-2.jpg`} alt={`${destination.title}的景点摄影`} fill unoptimized sizes="(max-width: 760px) 90vw, 31vw" /><figcaption>风景 · 03</figcaption></figure>
            </div>
          )}
          {destination.guide && (
            <section className="guide-section">
              <div className="section-heading compact-heading"><div><p className="eyebrow">行程参考</p><h2>行程攻略</h2></div><span>{destination.days}</span></div>
              <p className="body-copy">{destination.guide.intro}</p>
              <div className="guide-notes">
                <div><strong>节奏建议</strong><p>{destination.guide.pace}</p></div>
                <div><strong>住宿建议</strong><p>{destination.guide.stay}</p></div>
                <div><strong>交通建议</strong><p>{destination.guide.transport}</p></div>
              </div>
              <div className="day-list">
                {destination.guide.days.map((day) => (
                  <article className="day-item" key={day.id}>
                    <span className="day-index">{day.day}</span>
                    <div><h3>{day.title}</h3><p>{day.detail}</p></div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {(route.length > 0 || spots.length > 0) && (
            <section className="route-section">
              <p className="eyebrow">路线草图</p><h2>路线灵感</h2>
              {route.length > 0 && <ol className="route-list">{route.map((item, index) => <li key={`${index}-${item}`}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>}
              {spots.length > 0 && <p className="spot-note">重点想去：{spots.join(" · ")}</p>}
            </section>
          )}
        </div>

        <aside className="detail-aside" data-motion="rise">
          <section className="budget-panel">
            <p className="eyebrow">双人参考预算</p>
            <h2>{destination.pickBudget ? formatMoney(destination.pickBudget, destination.currency) : "预算待估算"}</h2>
            {hasBudget ? <>
              <p className="muted-copy">两人旅行总预算 · 区间 {formatMoney(destination.minBudget, destination.currency)}–{formatMoney(destination.maxBudget, destination.currency)}</p>
              <div className="budget-breakdown">
                {budget.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatMoney(value, destination.currency)}</strong></div>)}
              </div>
            </> : <p className="muted-copy">暂未填写详细预算分项。</p>}
            <p className="budget-warning">预算仅供旅行规划参考，出发前请按实际交通、住宿和游玩安排核对。</p>
          </section>

          <section className="season-panel">
            <p className="eyebrow">出行季节</p>
            <h3>{destination.months || "待确定"}</h3>
            <div className="tag-row">{seasons.map((season, index) => <span className="tag" key={`${index}-${season}`}>{season.endsWith("季") ? season : `${season}季`}</span>)}</div>
            <p className="muted-copy">出发前仍需核对景区开放、天气与节假日交通情况。</p>
          </section>
        </aside>
      </section>
      </main>
      <footer className="editorial-footer page-width"><Link href="/#destinations">← 回到目的地目录</Link><span>旅行心愿单</span><span>{settings.siteName}</span></footer>
    </div>
  );
}
