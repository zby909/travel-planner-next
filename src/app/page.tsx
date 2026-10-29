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
    prisma.flightPriceSample.findUnique({ where: { id: "user-sample-guangzhou-urumqi-2026-11" } }),
  ]);

  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <Image className="hero-image" src="/images/altay-0.jpg" alt="新疆阿勒泰山地风景" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="hero-content page-width">
          <p className="eyebrow eyebrow-light">A JOURNEY FOR TWO · 2027</p>
          <h1>下一站，<br /><em>和你去看</em><br />世界。</h1>
          <p className="hero-copy">想和你在北国看雪，在海边吹风，<br />走过京都的小巷，也看一看遥远的沙漠。<br />远方很多，我们慢慢来。</p>
          <div className="hero-actions">
            <Link className="button button-light" href="#destinations">一起挑选下一站 <span>↗</span></Link>
            <Link className="text-link text-link-light" href="/visited">翻看已经走过的地方 ↗</Link>
          </div>
          <p className="hero-footnote">广州出发 · 两个人 · 预算务实 · 天数不硬凑</p>
        </div>
        <div className="hero-side-note">VOL. 01 / OUR TRAVEL DIARY</div>
      </section>

      <section className="intro-band page-width">
        <div>
          <p className="eyebrow">A LITTLE NOTE TO US</p>
          <h2>不是收集地名，<br />是期待<em>还没一起看过的世界。</em></h2>
        </div>
        <div className="intro-copy">
          <p>先找到真正期待的风景，再决定出发日期。不为了凑假期赶景点，也不为了花满预算而消费。</p>
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
          <p>预算按两个人合计。机票区分平日与节假日，价格样本和规划估算分开看。</p>
        </div>
        <div className="destination-grid">
          {destinations.map((destination) => {
            const types = parseJsonArray<string>(destination.typesJson);
            return (
              <article className="destination-card" key={destination.id}>
                <Link className="destination-photo" href={`/destinations/${destination.id}`}>
                  <Image src={`/images/${destination.id}-0.jpg`} alt={destination.title} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" />
                  <span className="photo-number">DESTINATION / {String(destination.rank).padStart(2, "0")}</span>
                  <span className="photo-arrow">↗</span>
                </Link>
                <div className="destination-content">
                  <div className="destination-meta"><span>{destination.kind}</span><span>{destination.months}</span></div>
                  <h3><Link href={`/destinations/${destination.id}`}>{destination.title}</Link></h3>
                  <p className="destination-subtitle">{destination.subtitle}</p>
                  <p className="destination-vibe">{destination.vibe}</p>
                  <div className="tag-row">{types.slice(0, 3).map((type) => <span className="tag" key={type}>{type}</span>)}</div>
                  <div className="budget-line"><span>双人预算参考</span><strong>{formatCny(destination.minBudget)}–{formatCny(destination.maxBudget)}</strong></div>
                  <div className="flight-line">
                    <span>平日机票</span><b>{formatCny(destination.flightPricing?.normalMin)}–{formatCny(destination.flightPricing?.normalMax)}</b>
                    <span>节假日</span><b>{formatCny(destination.flightPricing?.holidayMin)}–{formatCny(destination.flightPricing?.holidayMax)}</b>
                  </div>
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
          <Link className="button button-dark" href="/visited">打开我们的旅行足迹 <span>↗</span></Link>
        </div>
        <div className="visited-invite-photo">
          <Image src="/images/visited/sichuan.jpg" alt="川西旅行风景" fill sizes="(max-width: 760px) 100vw, 45vw" />
          <span>MEMORIES WE KEEP</span>
        </div>
      </section>

      <footer className="site-footer page-width">
        <Link className="brand brand-footer" href="/"><span className="brand-mark">✳</span><span className="brand-name">下一站<small>THE NEXT JOURNEY</small></span></Link>
        <p>慢慢规划，认真出发。<br />一份属于两个人的旅行档案。</p>
      </footer>
    </main>
  );
}
