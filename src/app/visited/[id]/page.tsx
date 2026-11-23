import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePhotoGallery } from "@/components/place-photo-gallery";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { coverPosition, getPlaceImageUrl, getPlacePhotoUrl } from "@/lib/media";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { getSiteContentAccess, requireSiteContentAccess } from "@/lib/site-access";
import { getVisitDate, sortPlaceVisits, visitGroupLabel, visitPhotoOrder } from "@/lib/place-visits";
import { prisma } from "@/lib/prisma";
import styles from "./place-detail.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// 在确认当前访客具有阅读权限后再输出具体地点标题，私密模式下不泄露地点名称。
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const access = await getSiteContentAccess();
  if (!access.allowed) {
    return {
      title: "地点与历次到访｜我们的旅行手记",
      description: "翻看收藏在这个地方的每一次到访、旅行手记和照片。",
    };
  }
  const { id } = await params;
  const [place, settings] = await Promise.all([
    prisma.visitedPlace.findUnique({ where: { id, isArchived: false }, select: { name: true, region: true } }),
    getSiteSettings(),
  ]);
  if (!place) return { title: `去过的地方｜${settings.siteName}` };
  return {
    title: `${place.name}｜${settings.siteName}`,
    description: `${place.region} · 翻看收藏在${place.name}的每一次到访、旅行手记与照片。`,
  };
}

// 同一地点的手记和相册依到访顺序展示，每次到访可单独链接。
export default async function VisitedPlaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireSiteContentAccess(`/visited/${encodeURIComponent(id)}`);

  const [place, settings, places] = await Promise.all([
    prisma.visitedPlace.findUnique({
      where: { id, isArchived: false },
      include: { visits: { where: { deletedAt: null }, include: {
        photos: { orderBy: visitPhotoOrder, include: { mediaAsset: { select: { id: true, status: true, fileName: true, width: true, height: true } } } },
      } } },
    }),
    getSiteSettings(),
    prisma.visitedPlace.findMany({
      where: { isArchived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true },
    }),
  ]);
  if (!place) notFound();

  const location = [...new Set([place.city, place.province, place.country].filter(Boolean))].join(" · ") || place.region;
  const labels = getGroupLabels(settings);
  const visits = sortPlaceVisits(place.visits).map(visit => ({
    ...visit,
    date: getVisitDate(visit),
    participant: visitGroupLabel(labels, visit.group),
    photos: visit.photos.flatMap(photo => {
      const src = getPlacePhotoUrl(photo);
      return src ? [{ id: photo.id, src, alt: photo.altText || `${place.name}旅行照片`, caption: photo.altText,
        width: photo.mediaAsset?.width, height: photo.mediaAsset?.height }] : [];
    }),
  }));
  const photoCount = visits.reduce((count, visit) => count + visit.photos.length, 0);
  const index = places.findIndex(item => item.id === id);
  const previous = places[index - 1];
  const next = places[index + 1];
  const placeholder = place.image.includes("placeholder");

  return (
    <div className={`travel-detail ${styles.page}`}>
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <main>
      <TravelMotion />
      <section className={`${styles.hero}${placeholder ? ` ${styles.illustrated}` : ""}`} aria-labelledby="place-title">
        <Image className={styles.cover} unoptimized src={getPlaceImageUrl(place.image)} alt="" fill preload sizes="100vw" style={placeholder ? undefined : { objectPosition: coverPosition(place) }} />
        <div className={`page-width ${styles.heroInner}`}>
          <Link className={styles.back} href="/visited#place-atlas">← 去过的地方</Link>
          <div className={styles.heroContent}>
            <div>
              {location ? <p className={styles.location}>{location}</p> : null}
              <h1 id="place-title">{place.name}</h1>
              {place.mapNote ? <p className={styles.intro}>{place.mapNote}</p> : null}
            </div>
            <a className={styles.heroLink} href="#place-visits">
              <span><strong>{visits.length} 次到访</strong>{photoCount ? <small>{photoCount} 张照片</small> : null}</span>
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <section className={`page-width ${styles.chronicle}`} id="place-visits" aria-labelledby="place-visits-title">
        <div className={styles.rail}>
          <h2 id="place-visits-title">历次到访</h2>
          {visits.length > 1 ? <nav aria-label="按到访日期跳转"><ol>
            {visits.map(visit => <li key={visit.id}>
              <a href={`#visit-${visit.id}`}><strong>{visit.date.label}</strong><small>{visit.participant}</small></a>
            </li>)}
          </ol></nav> : null}
        </div>
        {visits.length ? <ol className={styles.visits}>
          {visits.map(visit => {
            const title = visit.title.trim() && visit.title !== place.name ? visit.title : "";
            const note = visit.content.trim();
            return <li className={styles.visit} key={visit.id}>
              <article id={`visit-${visit.id}`} className={styles.entry}>
                <header className={styles.entryHeader}>
                  {title ? <p className={styles.date}><time dateTime={visit.date.dateTime}>{visit.date.label}</time></p> : null}
                  <div className={styles.entryTitle}>
                    <h3>{title || <time dateTime={visit.date.dateTime}>{visit.date.label}</time>}</h3>
                    <span className={styles.participant} data-group={visit.group}>{visit.participant}</span>
                  </div>
                  {visit.happenedAt && visit.whenLabel.trim() && visit.whenLabel.trim() !== visit.date.dateTime && visit.whenLabel.trim() !== visit.date.label ? <p className={styles.dateNote}>{visit.whenLabel.trim()}</p> : null}
                </header>
                {note ? <p className={styles.note}>{note}</p> : null}
                {visit.photos.length ? <PlacePhotoGallery placeName={place.name} caption={visit.date.label} photos={visit.photos} /> : null}
                {!note && !visit.photos.length ? <p className={styles.empty}>这次到访的手记与照片待补充。</p> : null}
              </article>
            </li>;
          })}
        </ol> : <p className={styles.empty}>这个地点还没有到访记录。</p>}
      </section>

      {(previous || next) ? (
        <nav className={`page-width ${styles.pagination}`} aria-label="浏览其他地点">
          {previous ? <Link href={`/visited/${encodeURIComponent(previous.id)}`}><small>← 上一个地点</small><strong>{previous.name}</strong></Link> : <span />}
          {next ? <Link href={`/visited/${encodeURIComponent(next.id)}`}><small>下一个地点 →</small><strong>{next.name}</strong></Link> : null}
        </nav>
      ) : null}
      </main>
      <footer className="editorial-footer page-width"><Link href="/visited#place-atlas">← 所有足迹</Link><span>{settings.siteName}</span></footer>
    </div>
  );
}
