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
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 3 }),
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

  const leadDestination = destinations.find(destination => destination.imagePath) ?? destinations[0];
  const heroImage = leadDestination
    ? leadDestination.imagePath ?? `/api/legacy-media/images/${leadDestination.id}-0.jpg`
    : visitedPreview[0] ? getPlaceImageUrl(visitedPreview[0].image) : "/images/destination-placeholder.svg";
  const heroCaption = leadDestination?.title ?? visitedPreview[0]?.name ?? "我们的下一站";
  const postcards = destinations.filter(destination => destination.id !== leadDestination?.id)
    .slice(0, 2).map(destination => ({
      id: destination.id,
      name: destination.title,
      image: destination.imagePath ?? `/api/legacy-media/images/${destination.id}-0.jpg`,
    }));
  const memoryImage = visitedPreview[0] ? getPlaceImageUrl(visitedPreview[0].image) : "/images/place-placeholder.svg";
  const memoryTitle = visitedPreview[0]?.name;

  return (
    <main className="home-page travel-home">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />

      <section className="journal-hero" aria-labelledby="journal-hero-title">
        <div className="journal-hero-inner page-width">
          <div className="journal-hero-copy">
            <p className="journal-kicker"><span /> A TRAVEL JOURNAL FOR TWO <span /></p>
            <h1 id="journal-hero-title">下一站，<br /><em>和你去看世界。</em></h1>
            <p className="journal-hero-description">有些地方已经留下脚印，<br />有些风景还在心愿里。<br />把每一次期待和出发，都写进我们的旅行故事。</p>
            <div className="journal-hero-actions">
              <Link className="journal-primary-link" href="#destinations">看看下一站 <span aria-hidden="true">↗</span></Link>
              <Link className="journal-quiet-link" href="/visited">翻看我们的足迹 <span aria-hidden="true">↗</span></Link>
            </div>
            <p className="journal-hero-signature"><span>✳</span> 两个人的旅行手记 · 慢慢更新中</p>
          </div>
          <div className="journal-collage" aria-label="旅行照片与心愿明信片">
            <figure className="journal-cover-photo">
              <Image src={heroImage} alt={`${heroCaption}旅行封面`} fill priority unoptimized sizes="(max-width: 900px) 90vw, 43vw" />
              <figcaption><span>POSTCARD NO. 01</span><strong>{heroCaption}</strong></figcaption>
            </figure>
            {postcards.length > 0 && (
              <figure className="journal-small-photo">
                <Image src={postcards[0].image} alt={`${postcards[0].name}旅行风景`} fill unoptimized sizes="(max-width: 900px) 38vw, 16vw" />
                <figcaption>{postcards[0].name}</figcaption>
              </figure>
            )}
            <div className="journal-round-stamp" aria-hidden="true">JUST<br />US TWO<br /><span>✳</span></div>
            <div className="journal-photo-note">THE PLACES WE DREAM OF <span>— 001</span></div>
          </div>
        </div>
        <div className="journal-hero-bottom page-width"><span>OUR LITTLE TRAVEL STORY</span><a href="#journal-story">继续往下看 <span aria-hidden="true">↓</span></a></div>
      </section>

      <section className="journal-ledger page-width" id="journal-story" aria-label="我们的旅行记录概览">
        <div className="journal-ledger-heading"><span className="journal-chapter">01 / OUR STORY</span><p>一路的风景，<br />慢慢变成故事。</p></div>
        <div className="journal-stat"><strong>{visitedCount}</strong><span>个到访足迹</span></div>
        <div className="journal-stat"><strong>{destinations.length}</strong><span>个想去的地方</span></div>
        <div className="journal-stat"><strong>{timelineCount}</strong><span>条旅途记录</span></div>
      </section>

      <section className="journal-memory" aria-labelledby="journal-memory-title">
        <div className="journal-memory-inner page-width">
          <div className="journal-memory-copy">
            <p className="journal-chapter">02 / THE PLACES WE&apos;VE BEEN</p>
            <h2 id="journal-memory-title">去过的地方，<br /><em>都有它的故事。</em></h2>
            <p>不只是标记地图上的一个点。那天的天气、路上的风景，和谁一起走过的，都值得被好好收藏。</p>
            <Link href="/visited" className="journal-outline-link">打开足迹相册 <span aria-hidden="true">↗</span></Link>
            <span className="journal-memory-foot">OUR MEMORIES, ONE PLACE AT A TIME.</span>
          </div>
          <div className="journal-memory-gallery">
            <div className="journal-memory-photo">
              <Image src={memoryImage} alt={memoryTitle ? `${memoryTitle}到访照片` : "足迹相册等待记录"} fill unoptimized sizes="(max-width: 900px) 90vw, 44vw" />
            </div>
            <div className="journal-memory-caption"><span>{memoryTitle ?? "尚待写下第一站"}</span><span>TRAVEL ARCHIVE <b>↗</b></span></div>
          </div>
        </div>
      </section>

      <section className="journal-wishlist page-width" id="destinations" aria-labelledby="journal-wishlist-title">
        <div className="journal-wishlist-heading">
          <div><p className="journal-chapter">03 / OUR WISHLIST</p><h2 id="journal-wishlist-title">把下一站，<br /><em>留给心动。</em></h2></div>
          <p>从想去的一处风景开始，慢慢计划我们的下一次出发。<br />日期不必着急决定，先把喜欢的地方记下来。</p>
        </div>
        <DestinationExplorer destinations={explorerDestinations} currency={settings.currency} />
      </section>

      <section className="journal-closing" aria-label="旅行手记尾声">
        <span>TO ALL THE PLACES WE HAVEN&apos;T BEEN</span>
        <h2>路还很长，<em>我们慢慢走。</em></h2>
        <Link href="/visited">去看看走过的路 <span aria-hidden="true">↗</span></Link>
      </section>
      <footer className="journal-footer page-width">
        <Link href="/" className="journal-footer-brand"><span>✳</span> {settings.siteName}</Link>
        <p>记录去过的地方，也收藏下一次出发的期待。</p>
        <span>{settings.siteSubtitle}</span>
      </footer>
    </main>
  );
}
