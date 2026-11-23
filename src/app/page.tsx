import Image from "next/image";
import Link from "next/link";
import { DestinationExplorer } from "@/components/destination-explorer";
import { HomeMemberPanel } from "@/components/home-member-panel";
import { PlacePhotoGallery } from "@/components/place-photo-gallery";
import { SiteHeader } from "@/components/site-header";
import { visibleMemoryWhere } from "@/lib/content-visibility";
import { parseJsonArray } from "@/lib/format";
import { coverPosition, getDestinationCoverUrl, getPlaceImageUrl, getPlacePhotoUrl, photoPreviewUrl } from "@/lib/media";
import { getVisitDate, visitGroupLabel, visitPhotoOrder } from "@/lib/place-visits";
import { needsInitialSetup } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSiteContentAccess } from "@/lib/site-access";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import styles from "./home-editorial.module.css";

export const dynamic = "force-dynamic";
const photoFields = { filePath: true, mediaAsset: { select: { id: true, status: true, fileName: true, width: true, height: true } } } as const;
const placeFields = { id: true, name: true, region: true, image: true, coverX: true, coverY: true } as const;

// 首页从两个人已有的照片中选封面，最近更新与按旅行日期排列的足迹分别呈现。
export default async function HomePage() {
  const user = await requireSiteContentAccess("/");
  const [settings, destinations, placeCount, visitCount, photoCount, firstCover, curatedPhotos, memories, showSetup] = await Promise.all([
    getSiteSettings(),
    prisma.destination.findMany({ where: { isArchived: false }, orderBy: [{ rank: "asc" }, { id: "asc" }], select: {
      id: true, title: true, subtitle: true, flag: true, imagePath: true, kind: true, typesJson: true, months: true,
      seasonsJson: true, days: true, pickBudget: true, currency: true, rank: true, vibe: true,
    } }),
    prisma.visitedPlace.count({ where: { isArchived: false } }),
    prisma.travelMemory.count({ where: visibleMemoryWhere }),
    prisma.travelPhoto.count({ where: { memory: visibleMemoryWhere } }),
    prisma.visitedPlace.findFirst({ where: { isArchived: false, NOT: { image: { contains: "placeholder" } } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: placeFields }),
    prisma.travelPhoto.findMany({ where: { isFeatured: true, memory: visibleMemoryWhere }, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { ...photoFields, id: true, altText: true, memory: { select: { id: true, happenedAt: true, whenLabel: true, place: { select: { id: true, name: true } } } } } }),
    prisma.travelMemory.findMany({ where: visibleMemoryWhere, orderBy: [{ updatedAt: "desc" }, { place: { sortOrder: "asc" } }, { id: "asc" }], take: 4,
      select: { id: true, happenedAt: true, whenLabel: true, group: true, title: true, place: { select: placeFields },
        photos: { orderBy: visitPhotoOrder, take: 1, select: photoFields } } }),
    user ? Promise.resolve(false) : needsInitialSetup(),
  ]);
  const labels = getGroupLabels(settings);
  const recent = memories.flatMap(visit => {
    if (!visit.place) return [];
    const photo = visit.photos[0] && getPlacePhotoUrl(visit.photos[0]);
    return [{ ...visit, place: visit.place, image: photo || getPlaceImageUrl(visit.place.image),
      position: photo ? "center" : coverPosition(visit.place), href: `/visited/${encodeURIComponent(visit.place.id)}#visit-${visit.id}` }];
  });
  const featured = curatedPhotos.flatMap(photo => {
    const src = getPlacePhotoUrl(photo);
    const place = photo.memory?.place;
    return src && place && photo.memory ? [{
      id: photo.id, src, alt: photo.altText || `${place.name}旅行照片`, caption: photo.altText,
      width: photo.mediaAsset?.width, height: photo.mediaAsset?.height,
      href: `/visited/${encodeURIComponent(place.id)}#visit-${photo.memory.id}`, label: `${place.name} · ${getVisitDate(photo.memory).label}`,
    }] : [];
  });
  const recentCover = recent.find(visit => !visit.image.includes("placeholder"));
  const wish = destinations.find(item => !item.imagePath?.includes("placeholder"));
  const cover = featured[0] ? { src: featured[0].src, label: featured[0].label, href: featured[0].href, position: "center" }
    : recentCover ? { src: recentCover.image, label: recentCover.place.name, href: recentCover.href, position: recentCover.position }
    : firstCover ? { src: getPlaceImageUrl(firstCover.image), label: firstCover.name, href: `/visited/${encodeURIComponent(firstCover.id)}`, position: coverPosition(firstCover) }
    : wish ? { src: getDestinationCoverUrl(wish.id, wish.imagePath), label: wish.title, href: `/destinations/${encodeURIComponent(wish.id)}`, position: "center" } : null;
  const wishes = destinations.map(({ imagePath, typesJson, seasonsJson, ...item }) => ({
    ...item, imagePath: imagePath ? getDestinationCoverUrl(item.id, imagePath) : null, types: parseJsonArray(typesJson), seasons: parseJsonArray(seasonsJson),
  }));
  const latestVisit = recent[0] ? { id: recent[0].id, placeId: recent[0].place.id, placeName: recent[0].place.name } : null;

  return <div id="top" className="travel-home">
    <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
    <main>
    <section className={styles.cover} aria-labelledby="cover-title">
      {cover && <Image className={styles.coverImage} src={cover.src} alt="" fill preload sizes="100vw" style={{ objectPosition: cover.position }} />}
      <div className={`page-width ${styles.coverInner}`}>
        <div className={styles.coverCopy}>
          <h1 id="cover-title">两个人的<br /><span>旅行手记</span></h1>
          <p>{placeCount ? `${placeCount} 个地点 · ${visitCount} 次出发${photoCount ? ` · ${photoCount} 张回忆` : ""}` : showSetup ? "一分钟布置你们的私人旅行空间。" : "记下第一次出发。"}</p>
          <Link className={styles.coverAction} href={showSetup ? "/setup" : placeCount ? "/visited" : user ? "/admin/places/new" : "/visited"}>
            {showSetup ? "开始布置空间" : placeCount ? "翻看足迹" : user ? "记录第一次旅行" : "翻开手记"} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {cover ? <Link className={styles.coverCredit} href={cover.href}><span>封面</span>{cover.label} ↗</Link> : null}
      </div>
    </section>
    {user ? <HomeMemberPanel name={user.displayName} latestVisit={latestVisit} /> : null}
    {recent.length > 0 && <section className={`page-width ${styles.section}`} id="recent-visits" aria-labelledby="recent-title">
      <div className={styles.heading}><h2 id="recent-title">最近更新的手记</h2><Link href="/visited#timeline">按日期翻看 ↗</Link></div>
      <div className={styles.recent}>{recent.map(visit => <Link className={styles.visit} key={visit.id} href={visit.href}>
        <div className={styles.visitImage}><Image src={photoPreviewUrl(visit.image, 960)} alt="" fill
          style={{ objectPosition: visit.position }} sizes="(max-width: 880px) 45vw, 23vw" /></div>
        <div className={styles.visitText}><small>{getVisitDate(visit).label} · {visitGroupLabel(labels, visit.group)}</small>
          <h3>{visit.place.name}</h3><p>{visit.title && visit.title !== visit.place.name ? visit.title : visit.place.region}</p></div>
      </Link>)}</div>
    </section>}
    {featured.length > 0 && <section className={styles.featured} aria-labelledby="featured-title">
      <div className="page-width"><div className={styles.heading}><h2 id="featured-title">精选相片</h2></div>
        <PlacePhotoGallery placeName={settings.siteName} caption="首页精选" photos={featured} featured />
      </div>
    </section>}
    <section className="editorial-wishlist page-width" id="destinations" aria-labelledby="wishlist-title">
      <div className={styles.heading}><h2 id="wishlist-title">想去的地方</h2></div>
      {wishes.length ? <DestinationExplorer destinations={wishes} /> : <div className="editorial-empty" data-testid="empty-destinations">
        <p>还没有想去的地方。</p>
        <Link href={user ? "/admin/destinations/new" : "/login?next=/admin/destinations/new"}>记下第一个目的地 ↗</Link>
      </div>}
    </section>
    </main>
    <footer className="editorial-footer page-width"><Link href="/">{settings.siteName}</Link><a href="#top">回到页首 ↑</a></footer>
  </div>;
}
