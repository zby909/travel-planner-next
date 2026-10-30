import Image from "next/image";
import Link from "next/link";
import { DestinationExplorer, type DestinationExplorerItem } from "@/components/destination-explorer";
import { SiteHeader } from "@/components/site-header";
import { parseJsonArray } from "@/lib/format";
import { getPlaceImageUrl } from "@/lib/media";
import { getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, destinations, visitedCount, visitedPreview, timelineCount] = await Promise.all([
    getSiteSettings(),
    prisma.destination.findMany({ orderBy: { rank: "asc" }, include: { flightPricing: true } }),
    prisma.visitedPlace.count(),
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 2 }),
    prisma.timelineEntry.count(),
  ]);

  const explorerDestinations: DestinationExplorerItem[] = destinations.map(destination => ({
    id: destination.id,
    title: destination.title,
    subtitle: destination.subtitle,
    flag: destination.flag,
    imagePath: destination.imagePath,
    kind: destination.kind,
    types: parseJsonArray<string>(destination.typesJson),
    months: destination.months,
    seasons: parseJsonArray<string>(destination.seasonsJson),
    days: destination.days,
    minBudget: destination.minBudget,
    maxBudget: destination.maxBudget,
    pickBudget: destination.pickBudget,
    rank: destination.rank,
    style: destination.style,
    badge: destination.badge,
    vibe: destination.vibe,
    spots: parseJsonArray<string>(destination.spotsJson),
    flightPricing: destination.flightPricing ? {
      route: destination.flightPricing.route,
      normalMin: destination.flightPricing.normalMin,
      normalMax: destination.flightPricing.normalMax,
      holidayMin: destination.flightPricing.holidayMin,
      holidayMax: destination.flightPricing.holidayMax,
    } : null,
  }));

  const heroImage = destinations[0]?.imagePath ?? (destinations[0]
    ? `/api/legacy-media/images/${destinations[0].id}-0.jpg`
    : visitedPreview[0] ? getPlaceImageUrl(visitedPreview[0].image) : "/images/destination-placeholder.svg");
  const heroPhotos = destinations.slice(0, 3).map(destination => ({
    id: destination.id,
    title: destination.title,
    image: destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`,
  }));
  const memoryImages = [visitedPreview[0], visitedPreview[1]].map(place => place ? getPlaceImageUrl(place.image) : "/images/place-placeholder.svg");

  return (
    <main className="home-page">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <section className="hero" aria-label="旅行灵感册封面">
        <Image className="hero-image" src={heroImage} alt="旅行目的地封面" fill priority unoptimized={heroImage.startsWith("/api/")} sizes="100vw" />
        <div className="hero-vignette" />
        <div className="hero-content page-width">
          <div className="hero-label"><span className="hairline" /> A JOURNEY FOR TWO <span className="hairline" /> {settings.siteSubtitle}</div>
          <h1>下一站，<br /><em>和你去看</em><br />世界<span className="period">。</span></h1>
          <p className="hero-copy">想和你在北国看雪，在海边吹风，<br />走过陌生的街巷，也看一看遥远的山川。<br />远方很多，我们慢慢来。</p>
          <div className="hero-actions">
            <Link className="button button-light" href="#destinations">一起挑选下一站 <span>↗</span></Link>
            <span>{destinations.length} 个心愿目的地 · {visitedCount} 个旅行足迹</span>
            <Link className="hero-memories-link" href="/visited">翻看我们走过的地方 ↗</Link>
          </div>
          <p className="hero-footnote">两个人 · 预算务实 · 不赶行程 · 慢慢出发</p>
        </div>
        {heroPhotos.length > 0 && <div className="photo-stack" aria-label="旅行目的地精选照片">
          {heroPhotos.map((photo, index) => <figure className={`stack-photo stack-${["a", "b", "c"][index]}`} key={photo.id}>
            <Image src={photo.image} alt={`${photo.title}目的地封面`} fill unoptimized sizes="180px" />
            <figcaption>{photo.title}</figcaption>
          </figure>)}
          <div className="hero-stamp">LET&apos;S<br />GO ↗</div>
        </div>}
        <span className="hero-aside">OUR SPACE / OUR TRAVEL JOURNAL</span>
        <a className="scroll-prompt" href="#manifesto"><span>SCROLL TO DISCOVER</span><i /></a>
      </section>

      <div className="ticker" aria-hidden="true"><div className="ticker-line">SOMEWHERE BEAUTIFUL <span>✳</span> JUST THE TWO OF US <span>✳</span> SOMEWHERE BEAUTIFUL <span>✳</span> JUST THE TWO OF US <span>✳</span></div></div>

      <section className="intro-band page-width" id="manifesto">
        <div>
          <p className="eyebrow">A LITTLE NOTE TO US</p>
          <h2>不是收集地名，<br />是期待<em>还没一起看过的世界。</em></h2>
        </div>
        <div className="intro-copy">
          <p>把想去的地方放进两个人的心愿清单，也把一起走过的路和各自看过的风景留在同一本旅行档案里。每一次出发都不必赶路，预算也应该有真实依据。</p>
          <div className="stats-row">
            <div><strong>{destinations.length}</strong><span>个我们想去的地方</span></div>
            <div><strong>{visitedCount}</strong><span>个我们走过的足迹</span></div>
            <div><strong>{timelineCount}</strong><span>条共同的时间记录</span></div>
          </div>
        </div>
      </section>

      <section className="memory-invite page-width">
        <div className="memory-invite-photos" aria-label="已经留下的旅行记忆">
          <span className="memory-photo memory-photo-a"><Image src={memoryImages[0]} alt="已保存的旅行足迹照片" fill unoptimized sizes="(max-width: 760px) 80vw, 38vw" /></span>
          <span className="memory-photo memory-photo-b"><Image src={memoryImages[1]} alt="已保存的旅行记忆照片" fill unoptimized sizes="(max-width: 760px) 55vw, 25vw" /></span>
        </div>
        <div>
          <p className="eyebrow">OUR SHARED MEMORIES</p>
          <h2>未来值得期待，<br /><em>一起走过的也值得珍藏。</em></h2>
          <p>把一起走过的路和各自看过的风景，慢慢拼成属于两个人的旅行地图。地点、季节、同行的人和记得的片段，都值得认真保存。</p>
          <Link className="text-link" href="/visited">打开旅行足迹 <span>↗</span></Link>
        </div>
      </section>

      <section className="section-block page-width" id="destinations">
        <div className="section-heading">
          <div><p className="eyebrow">OUR TRAVEL WISHLIST</p><h2>我们下一站，<em>去哪里？</em></h2></div>
          <p>这里的每个目的地都属于你们共同的心愿清单。可以按类型、季节和两人预算筛选，之后在后台一起补充与调整。</p>
        </div>
        <DestinationExplorer destinations={explorerDestinations} currency={settings.currency} />
      </section>

      <section className="ending">
        <Image src={heroImage} alt="旅行目的地风景" fill unoptimized sizes="100vw" />
        <div className="ending-shade" />
        <div className="ending-content">
          <span>TO ALL THE PLACES WE HAVEN&apos;T BEEN</span>
          <h2>路还很长，<br />我们慢慢走。</h2>
          <Link className="button button-light" href="#destinations">打开我们的心动清单 ♡</Link>
        </div>
      </section>

      <footer className="site-footer page-width">
        <Link className="brand brand-footer" href="/"><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>{settings.siteSubtitle}</small></span></Link>
        <p>慢慢规划，认真出发。<br />留给我们两个人的旅行档案。</p>
      </footer>
    </main>
  );
}
