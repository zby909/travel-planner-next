import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { formatMoney, parseJsonArray } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";
import { requireSiteContentAccess } from "@/lib/site-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

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
  if (!destination) notFound();

  const budget = [
    ["餐饮", destination.budgetFood],
    ["住宿", destination.budgetAccommodation],
    ["交通", destination.budgetTransport],
    ["其它", destination.budgetOther],
  ] as const;
  const route = parseJsonArray<string>(destination.routeJson);
  const spots = parseJsonArray<string>(destination.spotsJson);
  const types = parseJsonArray<string>(destination.typesJson);
  const seasons = parseJsonArray<string>(destination.seasonsJson);

  return (
    <main className="travel-detail">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <TravelMotion />
      <section className="cinematic-story" aria-labelledby="story-cover-title">
        <Image className="cinematic-backdrop" unoptimized src={destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`} alt="" fill priority sizes="100vw" />
        <div className="cinematic-vignette" aria-hidden="true" />
        <div className="cinematic-story-inner page-width">
          <Link className="cinematic-story-back" href="/#destinations">← 返回所有目的地</Link>
          <div className="cinematic-story-content">
            <p className="cinematic-kicker"><span /> THE NEXT JOURNEY / FIELD NOTES {String(destination.rank).padStart(2, "0")}</p>
            <h1 id="story-cover-title">{destination.title}</h1>
            <p className="cinematic-story-subtitle">{destination.subtitle}</p>
            <p className="cinematic-story-vibe">{destination.vibe || "一段等待出发的旅程。"}</p>
          </div>
          <div className="cinematic-story-bottom"><span>POSTCARDS FROM THE FUTURE</span><span>01 / THE STORY BEGINS</span></div>
        </div>
      </section>
      <div className="story-keyfacts page-width" data-motion="rise">
        <div><span>IDEAL SEASON</span><strong>{destination.months || "待确定"}</strong></div>
        <div><span>TIME TO SPEND</span><strong>{destination.days || "待规划"}</strong></div>
        <div><span>TRAVEL STYLE</span><strong>{types.join(" · ") || destination.kind}</strong></div>
        <div><span>FOR TWO / ESTIMATE</span><strong>{destination.pickBudget ? formatMoney(destination.pickBudget, settings.currency) : "预算待估算"}</strong></div>
      </div>

      <section className="detail-layout page-width">
        <div className="detail-main" data-motion="rise">
          <p className="eyebrow">WHY THIS JOURNEY</p>
          <h2>去往远方的<em>一个理由。</em></h2>
          <p className="lead-copy">{destination.reason}</p>
          {!destination.imagePath && (
            <div className="cinematic-story-gallery" aria-label={`${destination.title}的旅行景观组图`}>
              <figure><Image src={`/api/legacy-media/images/${destination.id}-1.jpg`} alt={`${destination.title}的另一处风景`} fill unoptimized sizes="(max-width: 760px) 90vw, 31vw" /><figcaption>SCENE / 02</figcaption></figure>
              <figure><Image src={`/api/legacy-media/images/${destination.id}-2.jpg`} alt={`${destination.title}的景点摄影`} fill unoptimized sizes="(max-width: 760px) 90vw, 31vw" /><figcaption>SCENE / 03</figcaption></figure>
            </div>
          )}
          {destination.guide && (
            <section className="guide-section">
              <div className="section-heading compact-heading"><div><p className="eyebrow">DAY BY DAY</p><h2>行程攻略</h2></div><span>{destination.days}</span></div>
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
          <section className="route-section">
            <p className="eyebrow">ROUTE IDEA</p><h2>路线灵感</h2>
            <ol className="route-list">{route.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>
            {spots.length > 0 && <p className="spot-note">重点想去：{spots.join(" · ")}</p>}
          </section>
        </div>

        <aside className="detail-aside" data-motion="rise">
          <section className="budget-panel">
            <p className="eyebrow">BUDGET FOR TWO</p>
            <h2>{destination.pickBudget ? formatMoney(destination.pickBudget, settings.currency) : "预算待估算"}</h2>
            <p className="muted-copy">两人旅行总预算 · 区间 {formatMoney(destination.minBudget, settings.currency)}–{formatMoney(destination.maxBudget, settings.currency)}</p>
            <div className="budget-breakdown">
              {budget.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatMoney(value, settings.currency)}</strong></div>)}
            </div>
            <p className="budget-warning">预算仅供旅行规划参考，出发前请按实际交通、住宿和游玩安排核对。</p>
          </section>

          <section className="season-panel">
            <p className="eyebrow">WHEN TO GO</p>
            <h3>{destination.months}</h3>
            <div className="tag-row">{seasons.map((season) => <span className="tag" key={season}>{season}季</span>)}</div>
            <p className="muted-copy">出发前仍需核对景区开放、天气与节假日交通情况。</p>
          </section>
        </aside>
      </section>
      <footer className="editorial-footer page-width"><Link href="/#destinations">← 回到目的地目录</Link><span>THE NEXT JOURNEY / END OF CHAPTER</span><span>{settings.siteName}</span></footer>
    </main>
  );
}
