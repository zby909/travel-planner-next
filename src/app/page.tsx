import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { formatCny, formatDate, parseJsonArray } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [destinations, visitedCount, timelineCount, sample] = await Promise.all([
    prisma.destination.findMany({
      orderBy: { rank: "asc" },
      include: { flightPricing: true },
    }),
    prisma.visitedPlace.count(),
    prisma.timelineEntry.count(),
    prisma.flightPriceSample.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <Image className="hero-image" src="/images/destination-placeholder.svg" alt="旅行主题背景" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="hero-content page-width">
          <p className="eyebrow eyebrow-light">YOUR TRAVEL PLANNER</p>
          <h1>下一站，<br /><em>去看</em><br />世界。</h1>
          <p className="hero-copy">记录已经走过的路，规划未来的旅行。<br />从第一段回忆，到下一个目的地。</p>
          <div className="hero-actions">
            <Link className="button button-light" href="#destinations">挑选下一站 <span>↗</span></Link>
            <Link className="text-link text-link-light" href="/visited">翻看已经走过的地方 ↗</Link>
          </div>
          <p className="hero-footnote">属于你的旅行地图与计划</p>
        </div>
        <div className="hero-side-note">YOUR TRAVEL DIARY</div>
      </section>

      <section className="intro-band page-width">
        <div>
          <p className="eyebrow">A LITTLE NOTE TO US</p>
          <h2>不止是收集地名，<br />还有<em>值得期待的风景。</em></h2>
        </div>
        <div className="intro-copy">
          <p>把想去的地方添加到心愿清单，也把走过的路留在自己的旅行时间轴里。</p>
          <div className="stats-row">
            <div><strong>{destinations.length}</strong><span>个未来目的地</span></div>
            <div><strong>{visitedCount}</strong><span>个旅行与生活足迹</span></div>
            <div><strong>{timelineCount}</strong><span>条时间轴记录</span></div>
          </div>
        </div>
      </section>

      <section className="section-block page-width" id="destinations">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE NEXT JOURNEY</p>
            <h2>下一站，<em>去哪里？</em></h2>
          </div>
          <p>预算为旅行总额，可按照自己的出行人数调整；仅显示真实保存的计划和报价样本。</p>
        </div>
        {destinations.length === 0 && <div className="empty-state"><h3>还没有未来目的地</h3><p>登录管理后台创建 AI 授权，通过 travel-import Skill + travelctl 导入想去的地方。</p><Link className="button button-dark" href="/admin/tokens">前往 AI 授权设置</Link></div>}
        <div className="destination-grid">
          {destinations.map((destination) => {
            const types = parseJsonArray<string>(destination.typesJson);
            return (
              <article className="destination-card" key={destination.id}>
                <Link className="destination-photo" href={`/destinations/${destination.id}`}>
                  <Image unoptimized={!destination.imagePath || destination.imagePath.startsWith("/api/")} src={destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`} alt={destination.title} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" />
                  <span className="photo-number">DESTINATION / {String(destination.rank).padStart(2, "0")}</span>
                  <span className="photo-arrow">↗</span>
                </Link>
                <div className="destination-content">
                  <div className="destination-meta"><span>{destination.kind}</span><span>{destination.months}</span></div>
                  <h3><Link href={`/destinations/${destination.id}`}>{destination.title}</Link></h3>
                  <p className="destination-subtitle">{destination.subtitle}</p>
                  <p className="destination-vibe">{destination.vibe}</p>
                  <div className="tag-row">{types.slice(0, 3).map((type) => <span className="tag" key={type}>{type}</span>)}</div>
                  <div className="budget-line"><span>总预算参考</span><strong>{destination.maxBudget === 0 ? "待估算" : `${formatCny(destination.minBudget)}–${formatCny(destination.maxBudget)}`}</strong></div>
                  {destination.flightPricing && (destination.flightPricing.normalMax > 0 || destination.flightPricing.holidayMax > 0) && <div className="flight-line">
                    <span>平日机票</span><b>{formatCny(destination.flightPricing?.normalMin)}–{formatCny(destination.flightPricing?.normalMax)}</b>
                    <span>节假日</span><b>{formatCny(destination.flightPricing?.holidayMin)}–{formatCny(destination.flightPricing?.holidayMax)}</b>
                  </div>}
                  <Link className="card-more" href={`/destinations/${destination.id}`}>查看行程与预算 <span>↗</span></Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {sample && (
        <section className="sample-section" id="flight-sample">
          <div className="page-width sample-inner">
            <div>
              <p className="eyebrow">FLIGHT PRICE NOTE · USER REPORTED</p>
              <h2>一条真实查询样本，<br /><em>比一个猜出来的数字更有用。</em></h2>
              <p className="sample-route">{sample.route} · {formatDate(sample.departureDate)}—{formatDate(sample.returnDate)}</p>
              <p className="muted-copy">{sample.notes}</p>
            </div>
            <div className="sample-price">
              <span>两人往返参考</span>
              <strong>{formatCny(sample.totalPrice)}</strong>
              <small>{formatCny(sample.pricePerPerson)} / 人 · 用户提供样本</small>
            </div>
          </div>
        </section>
      )}

      <section className="visited-invite page-width">
        <div className="visited-invite-copy">
          <p className="eyebrow">WHERE WE HAVE BEEN</p>
          <h2>过去值得珍藏，<br /><em>未来值得期待。</em></h2>
          <p>把去过的地方、各自的旅行时间和共同回忆慢慢整理起来。生活足迹和真正的旅行记录，也可以被认真保存。</p>
          <Link className="button button-dark" href="/visited">查看旅行足迹 <span>↗</span></Link>
        </div>
        <div className="visited-invite-photo">
          <Image src="/images/place-placeholder.svg" alt="旅行记忆插画" fill sizes="(max-width: 760px) 100vw, 45vw" />
          <span>MEMORIES WE KEEP</span>
        </div>
      </section>

      <footer className="site-footer page-width">
        <Link className="brand brand-footer" href="/"><span className="brand-mark">✳</span><span className="brand-name">下一站<small>THE NEXT JOURNEY</small></span></Link>
        <p>慢慢规划，认真出发。<br />一份属于自己的旅行档案。</p>
      </footer>
    </main>
  );
}
