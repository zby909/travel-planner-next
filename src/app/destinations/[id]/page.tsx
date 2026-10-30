import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { formatDate, formatMoney, parseJsonArray } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function DestinationPage({ params }: PageProps) {
  const { id } = await params;
  const [destination, settings] = await Promise.all([
    prisma.destination.findUnique({
      where: { id },
      include: {
        flightPricing: true,
        guide: { include: { days: { orderBy: { sortOrder: "asc" } } } },
        priceSamples: { orderBy: { createdAt: "desc" } },
      },
    }),
    getSiteSettings(),
  ]);
  if (!destination) notFound();

  const budget = [
    ["机票", destination.budgetFlight],
    ["住宿", destination.budgetHotel],
    ["当地团费", destination.budgetGroup],
    ["餐饮", destination.budgetFood],
    ["门票与体验", destination.budgetTickets],
    ["当地交通", destination.budgetTransport],
    ["其他", destination.budgetOther],
  ] as const;
  const route = parseJsonArray<string>(destination.routeJson);
  const spots = parseJsonArray<string>(destination.spotsJson);
  const types = parseJsonArray<string>(destination.typesJson);
  const seasons = parseJsonArray<string>(destination.seasonsJson);

  return (
    <main className="travel-detail">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <section className="story-cover page-width" aria-labelledby="story-cover-title">
        <div className="story-cover-top"><Link href="/#destinations">← BACK TO THE INDEX</Link><span>THE NEXT JOURNEY / FIELD NOTES</span><span>VOL. {String(destination.rank).padStart(2, "0")}</span></div>
        <div className="story-cover-heading">
          <div><p className="editorial-overline">A PLACE WE DREAM OF VISITING</p><h1 id="story-cover-title">{destination.title}</h1><p>{destination.subtitle}</p></div>
          <div className="story-cover-intro"><span>DESTINATION / {String(destination.rank).padStart(2, "0")}</span><p>{destination.vibe || "一场等待出发的旅程。"}</p></div>
        </div>
      </section>
      <figure className="story-cover-photo page-width">
        <Image unoptimized src={destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`} alt={`${destination.title}旅行风景`} fill priority sizes="(max-width: 760px) 100vw, 92vw" />
        <figcaption><span>PHOTOGRAPHIC JOURNAL / {destination.title}</span><span>01 / THE STORY BEGINS</span></figcaption>
      </figure>
      <div className="story-keyfacts page-width">
        <div><span>IDEAL SEASON</span><strong>{destination.months || "待确定"}</strong></div>
        <div><span>TIME TO SPEND</span><strong>{destination.days || "待规划"}</strong></div>
        <div><span>TRAVEL STYLE</span><strong>{types.join(" · ") || destination.kind}</strong></div>
        <div><span>FOR TWO / ESTIMATE</span><strong>{destination.pickBudget ? formatMoney(destination.pickBudget, settings.currency) : "预算待估算"}</strong></div>
      </div>

      <section className="detail-layout page-width">
        <div className="detail-main">
          <p className="eyebrow">WHY THIS JOURNEY</p>
          <h2>去往远方的<em>一个理由。</em></h2>
          <p className="lead-copy">{destination.reason}</p>
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

        <aside className="detail-aside">
          <section className="budget-panel">
            <p className="eyebrow">BUDGET FOR TWO</p>
            <h2>{destination.pickBudget ? formatMoney(destination.pickBudget, settings.currency) : "预算待估算"}</h2>
            <p className="muted-copy">两人旅行总预算 · 区间 {formatMoney(destination.minBudget, settings.currency)}–{formatMoney(destination.maxBudget, settings.currency)}</p>
            <div className="budget-breakdown">
              {budget.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatMoney(value, settings.currency)}</strong></div>)}
            </div>
            <p className="budget-warning">预算是规划参考，不是已锁定报价。出发前请重新核对机票、酒店和景区票价。</p>
          </section>

          {destination.flightPricing && (destination.flightPricing.normalMax > 0 || destination.flightPricing.holidayMax > 0) && (
            <section className="flight-panel">
              <p className="eyebrow">FLIGHT PRICE RANGE</p>
              <h3>{destination.flightPricing.route}</h3>
              <div className="flight-range"><span>普通日期 · 两人往返总额</span><strong>{formatMoney(destination.flightPricing.normalMin, settings.currency)}–{formatMoney(destination.flightPricing.normalMax, settings.currency)}</strong></div>
              <p>{destination.flightPricing.normalSample}</p>
              <div className="flight-range"><span>节假日 · 两人往返总额</span><strong>{formatMoney(destination.flightPricing.holidayMin, settings.currency)}–{formatMoney(destination.flightPricing.holidayMax, settings.currency)}</strong></div>
              <p>{destination.flightPricing.holidaySample}</p>
              <p className="muted-copy">{destination.flightNote}</p>
              {destination.flightSource && <a className="source-link" href={destination.flightSource} target="_blank" rel="noreferrer">查看参考来源 ↗</a>}
            </section>
          )}
          {destination.priceSamples.length > 0 && (
            <section className="flight-panel">
              <p className="eyebrow">SAVED FLIGHT EVIDENCE</p>
              <h3>已保存的机票价格样本</h3>
              {destination.priceSamples.map(item => (
                <div className="saved-flight-entry" key={item.id}>
                  <strong>{item.totalPrice == null ? formatMoney(item.pricePerPerson, item.currency) + "/人" : formatMoney(item.totalPrice, item.currency) + "/两人总价"}</strong>
                  <span>{item.sourceType === "PLANNING_ESTIMATE" ? "规划估算（非报价）" : item.sourceType === "USER_REPORTED" ? "用户实际查询" : item.sourceType === "HISTORICAL" ? "历史样本" : "公开价格参考"}</span>
                  <small>{formatDate(item.departureDate)}—{formatDate(item.returnDate)}</small>
                  <p>{item.notes || "此价格的行李政策、航司及购买条件应再次核实。"}</p>
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">查看报价来源 ↗</a> : null}
                </div>
              ))}
            </section>
          )}
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
