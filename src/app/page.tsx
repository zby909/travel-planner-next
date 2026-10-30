import Image from "next/image";
import Link from "next/link";
import { DestinationExplorer, type DestinationExplorerItem } from "@/components/destination-explorer";
import { SiteHeader } from "@/components/site-header";
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

  const coverPlace = visitedPreview[2] ?? visitedPreview[0];
  const coverImage = coverPlace ? getPlaceImageUrl(coverPlace.image)
    : destinations[0] ? destinations[0].imagePath ?? `/api/legacy-media/images/${destinations[0].id}-0.jpg`
    : "/images/destination-placeholder.svg";
  const coverTitle = coverPlace?.name ?? destinations[0]?.title ?? "下一站，未完待续";
  const firstMemory = visitedPreview[0];
  const secondMemory = visitedPreview[1] ?? visitedPreview[0];

  return (
    <main className="travel-home">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <section className="editorial-cover" aria-labelledby="cover-title">
        <div className="editorial-cover-copy">
          <div className="editorial-cover-top"><span>THE NEXT JOURNEY</span><span>ISSUE NO. 001 / FOR TWO</span></div>
          <div className="editorial-cover-center">
            <p className="editorial-overline">A VISUAL DIARY OF US</p>
            <h1 id="cover-title">世界那么大，<br /><em>我们慢慢走。</em></h1>
            <div className="editorial-cover-rule" />
            <p>把见过的山海，和还没抵达的远方，<br />留在一本属于两个人的旅行杂志里。</p>
            <Link href="#destinations" className="editorial-arrow-link">翻开下一页 <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="editorial-cover-bottom"><span>TRAVEL / PHOTOGRAPHY / MEMORIES</span><span>01 — 04</span></div>
        </div>
        <figure className="editorial-cover-visual">
          <Image src={coverImage} alt={`${coverTitle}的旅行照片`} fill priority unoptimized sizes="(max-width: 800px) 100vw, 60vw" />
          <figcaption><span>ON THE ROAD · FRAME 001</span><span>{coverTitle} <b>↗</b></span></figcaption>
          <span className="editorial-cover-vertical" aria-hidden="true">COLLECTING MOMENTS, NOT MILES</span>
        </figure>
      </section>

      <div className="editorial-marquee" aria-hidden="true">
        <span>PLACES WE HAVE BEEN</span><span className="editorial-sparkle">✳</span>
        <span>PLACES WE DREAM OF</span><span className="editorial-sparkle">✳</span>
        <span>ALL THE MOMENTS IN BETWEEN</span>
      </div>

      <section className="editorial-intro page-width" aria-labelledby="intro-title">
        <div><p className="editorial-overline">EDITOR&apos;S LETTER / 001</p><h2 id="intro-title">旅行不是抵达，<br /><em>是一起经历。</em></h2></div>
        <div className="editorial-intro-right">
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
          <div className="editorial-moments-photo editorial-moments-photo-large">
            <Image src={firstMemory ? getPlaceImageUrl(firstMemory.image) : "/images/place-placeholder.svg"} alt={firstMemory ? `${firstMemory.name}到访照片` : "旅行相册空白页"} fill unoptimized sizes="(max-width: 760px) 90vw, 34vw" />
            <span>FIG. 01 / {firstMemory?.name ?? "OUR FIRST FRAME"}</span>
          </div>
          <div className="editorial-moments-copy">
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

      <section className="editorial-wishlist page-width" id="destinations" aria-labelledby="wishlist-title">
        <div className="editorial-section-head">
          <div><p className="editorial-overline">03 / THE WISHLIST · DESTINATION INDEX</p><h2 id="wishlist-title">下一站，<em>去哪里？</em></h2></div>
          <p>尚未发生的旅程，也值得拥有自己的篇章。<br />从一张照片开始，挑一处心动的远方。</p>
        </div>
        <DestinationExplorer destinations={explorerDestinations} currency={settings.currency} />
      </section>

      <section className="editorial-last-page">
        <span>THE LAST PAGE IS NEVER REALLY THE END</span>
        <h2>故事未完，<em>下一站见。</em></h2>
        <Link href="/visited" className="editorial-arrow-link">读一读我们的旅行故事 <span aria-hidden="true">↗</span></Link>
      </section>
      <footer className="editorial-footer page-width"><Link href="/">{settings.siteName} <small>✳</small></Link><span>AN ONGOING JOURNEY, JUST THE TWO OF US.</span><span>{settings.siteSubtitle}</span></footer>
    </main>
  );
}