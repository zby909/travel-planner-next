import Image from "next/image";
import Link from "next/link";
import { DestinationExplorer, type DestinationExplorerItem } from "@/components/destination-explorer";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { parseJsonArray } from "@/lib/format";
import { getPlaceImageUrl } from "@/lib/media";
import { getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 将数据库里的旅行心愿和足迹组织成一份真正由照片驱动的双人旅行杂志。
export default async function HomePage() {
  const [settings, destinations, visitedCount, visitedPreview, timelineCount] = await Promise.all([
    getSiteSettings(),
    prisma.destination.findMany({ orderBy: { rank: "asc" }, include: { flightPricing: true } }),
    prisma.visitedPlace.count(),
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 4 }),
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

  const scenicDestination = destinations.find(item => item.id === "altay") ?? destinations.find(item => item.imagePath) ?? destinations[0];
  const scenicImage = scenicDestination
    ? scenicDestination.imagePath ?? `/api/legacy-media/images/${scenicDestination.id}-0.jpg`
    : visitedPreview[0] ? getPlaceImageUrl(visitedPreview[0].image) : "/images/destination-placeholder.svg";
  const postcards = ["dongbei", "kansai", "qinggan"].map(id => destinations.find(item => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(item => ({ id: item.id, title: item.title, image: item.imagePath ?? `/api/legacy-media/images/${item.id}-0.jpg` }));
  const seasonFeatures = [
    { id: "dongbei", label: "WINTER", headline: "去看北国的雪" },
    { id: "yili", label: "SUMMER", headline: "去追夏天的花" },
    { id: "kansai", label: "AUTUMN", headline: "再走一次日本" },
  ].map(feature => ({ ...feature, destination: destinations.find(item => item.id === feature.id) }))
    .filter((feature): feature is typeof feature & { destination: NonNullable<typeof feature.destination> } => Boolean(feature.destination));
  const firstMemory = visitedPreview[0];
  const secondMemory = visitedPreview[1] ?? visitedPreview[0];

  return (
    <main className="travel-home">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <TravelMotion />
      <section className="cinematic-hero" aria-labelledby="cover-title">
        <Image className="cinematic-backdrop" src={scenicImage} alt="" fill priority unoptimized sizes="100vw" />
        <div className="cinematic-vignette" aria-hidden="true" />
        <div className="cinematic-inner page-width">
          <div className="cinematic-copy">
            <p className="cinematic-kicker"><span /> A JOURNEY FOR TWO <span /> OUR TRAVEL DIARY</p>
            <h1 id="cover-title">下一站，<br /><em>和你去看</em><br />世界<span className="cinematic-period">。</span></h1>
            <p className="cinematic-description">想和你在北国看雪，在海边吹风，<br />走过京都的小巷，也看看遥远的沙漠。<br />远方很多，我们慢慢来。</p>
            <div className="cinematic-actions">
              <Link className="cinematic-main-cta" href="#destinations">一起挑选下一站 <span aria-hidden="true">↗</span></Link>
              <Link className="cinematic-secondary-cta" href="/visited">翻看走过的地方 ↗</Link>
            </div>
            <p className="cinematic-footnote">TWO PEOPLE · ONE JOURNAL · COUNTLESS PLACES TO GO</p>
          </div>
          <div className="cinematic-stack" aria-label="未来想去的风景">
            {postcards.map((postcard, index) => (
              <Link href={`/destinations/${postcard.id}`} className={`cinematic-postcard cinematic-postcard-${index + 1}`} key={postcard.id}>
                <span className="cinematic-postcard-image">
                  <Image src={postcard.image} alt={`${postcard.title}的代表性风景`} fill unoptimized sizes="(max-width: 700px) 32vw, 21vw" />
                </span>
                <span className="cinematic-postcard-caption">{postcard.title} <small>↗</small></span>
              </Link>
            ))}
            <span className="cinematic-stamp" aria-hidden="true">LET&apos;S<br />GO <b>♡</b></span>
          </div>
        </div>
        <div className="cinematic-bottom page-width"><span>VOL. 01 / OUR LITTLE WORLD</span><a href="#intro-title">SCROLL TO DISCOVER <span aria-hidden="true">↓</span></a></div>
      </section>

      <div className="editorial-marquee" aria-hidden="true">
        <div className="cinematic-ticker-track">
          {[0, 1].map(copy => (
            <div className="cinematic-ticker-copy" key={copy}>
              <span>SOMEWHERE BEAUTIFUL</span><span className="editorial-sparkle">✳</span>
              <span>JUST THE TWO OF US</span><span className="editorial-sparkle">✳</span>
              <span>THE NEXT JOURNEY</span><span className="editorial-sparkle">✳</span>
            </div>
          ))}
        </div>
      </div>

      <section className="editorial-intro page-width" aria-labelledby="intro-title">
        <div data-motion="rise"><p className="editorial-overline">EDITOR&apos;S LETTER / 001</p><h2 id="intro-title">旅行不是抵达，<br /><em>是一起经历。</em></h2></div>
        <div className="editorial-intro-right" data-motion="rise">
          <p>我们不急着集齐多少座城市。喜欢的照片、某个地方的风、沿途的细碎时刻，都值得认真保存。未来也有很多想去的地方，可以慢慢商量，慢慢启程。</p>
          <div className="editorial-counts">
            <div><strong>{visitedCount}</strong><span>VISITED PLACES / 足迹</span></div>
            <div><strong>{destinations.length}</strong><span>ON OUR LIST / 心愿</span></div>
            <div><strong>{timelineCount}</strong><span>STORIES / 记录</span></div>
          </div>
        </div>
      </section>

      <section className="editorial-moments" aria-labelledby="moments-title">
        <div className="editorial-moments-inner page-width">
          <div className="editorial-moments-photo editorial-moments-photo-large" data-motion="photo">
            <Image src={firstMemory ? getPlaceImageUrl(firstMemory.image) : "/images/place-placeholder.svg"} alt={firstMemory ? `${firstMemory.name}到访照片` : "旅行相册空白页"} fill unoptimized sizes="(max-width: 760px) 90vw, 34vw" />
            <span>FIG. 01 / {firstMemory?.name ?? "OUR FIRST FRAME"}</span>
          </div>
          <div className="editorial-moments-copy" data-motion="rise">
            <p className="editorial-overline">02 / THE PHOTO ESSAY</p>
            <h2 id="moments-title">走过的路，<br /><em>都有光。</em></h2>
            <p>每一张照片背后，都有一次出发的理由。一页页翻下去，就是属于我们的旅行纪事。</p>
            <Link href="/visited" className="editorial-arrow-link">进入足迹相册 <span aria-hidden="true">↗</span></Link>
            <div className="editorial-moments-photo editorial-moments-photo-small">
              <Image src={secondMemory ? getPlaceImageUrl(secondMemory.image) : "/images/place-placeholder.svg"} alt={secondMemory ? `${secondMemory.name}的旅途` : "尚待记录的旅途"} fill unoptimized sizes="(max-width: 760px) 60vw, 23vw" />
              <span>FIG. 02 / {secondMemory?.name ?? "TO BE CONTINUED"}</span>
            </div>
          </div>
        </div>
      </section>

      {seasonFeatures.length > 0 && (
        <section className="cinematic-seasons" id="seasons" aria-labelledby="seasons-title">
          <div className="page-width">
            <div className="cinematic-section-intro" data-motion="rise">
              <p className="editorial-overline">POSTCARDS FROM THE FUTURE / 01</p>
              <h2 id="seasons-title">有些风景，<em>值得等一个季节。</em></h2>
              <p>想在最好的时候，去看喜欢的世界。</p>
            </div>
            <div className="cinematic-season-grid">
              {seasonFeatures.map((feature, index) => (
                <Link href={`/destinations/${feature.destination.id}`} className="cinematic-season" data-motion="photo" key={feature.destination.id}>
                  <Image src={feature.destination.imagePath ?? `/api/legacy-media/images/${feature.destination.id}-0.jpg`} alt={`${feature.destination.title}的代表性风景`} fill unoptimized sizes="(max-width: 700px) 100vw, 33vw" />
                  <span className="cinematic-season-shade" />
                  <span className="cinematic-season-number">{String(index + 1).padStart(2, "0")} / {feature.label}</span>
                  <span className="cinematic-season-title"><small>{feature.destination.months}</small><strong>{feature.headline}</strong><em>EXPLORE THE STORY ↗</em></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="editorial-wishlist page-width" id="destinations" aria-labelledby="wishlist-title">
        <div className="editorial-section-head" data-motion="rise">
          <div><p className="editorial-overline">03 / THE WISHLIST · DESTINATION INDEX</p><h2 id="wishlist-title">下一站，<em>去哪里？</em></h2></div>
          <p>尚未发生的旅程，也值得拥有自己的篇章。<br />从一张照片开始，挑一处心动的远方。</p>
        </div>
        <DestinationExplorer destinations={explorerDestinations} currency={settings.currency} />
      </section>

      <section className="editorial-last-page">
        <div className="cinematic-ending-content" data-motion="rise">
        <span>THE LAST PAGE IS NEVER REALLY THE END</span>
        <h2>故事未完，<em>下一站见。</em></h2>
        <Link href="/visited" className="editorial-arrow-link">读一读我们的旅行故事 <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
      <footer className="editorial-footer page-width"><Link href="/">{settings.siteName} <small>✳</small></Link><span>AN ONGOING JOURNEY, JUST THE TWO OF US.</span><span>{settings.siteSubtitle}</span></footer>
    </main>
  );
}