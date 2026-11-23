import Image from "next/image";
import Link from "next/link";
import { VisitedMap } from "@/components/visited-map";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { coverPosition, getPlaceImageUrl, photoPreviewUrl } from "@/lib/media";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { requireSiteContentAccess } from "@/lib/site-access";
import { visibleTimelineWhere } from "@/lib/content-visibility";
import { getVisitDate, latestPlaceVisit, placeVisitGroups, visitDateSelect, VISIT_GROUPS, visitGroupLabel } from "@/lib/place-visits";
import { buildVisitTimeline } from "@/lib/visit-timeline";
import { prisma } from "@/lib/prisma";
import styles from "./archive.module.css";

export const dynamic = "force-dynamic";

// 足迹目录用于查找地点，时间轴按日期串联每一次独立到访。
export default async function VisitedPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  const query = await searchParams;
  const term = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const group = VISIT_GROUPS.find(value => value === query.group);
  const params = new URLSearchParams();
  if (term) params.set("q", term);
  if (group) params.set("group", group);
  await requireSiteContentAccess(params.size ? `/visited?${params}` : "/visited");
  const [settings, places, events] = await Promise.all([
    getSiteSettings(),
    prisma.visitedPlace.findMany({
      where: { isArchived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { visits: { where: { deletedAt: null }, select: { ...visitDateSelect, title: true, content: true } } },
    }),
    prisma.timelineEntry.findMany({
      where: visibleTimelineWhere,
      include: { places: { orderBy: { sortOrder: "asc" }, include: { place: { select: { id: true, name: true, image: true, coverX: true, coverY: true } } } } },
    }),
  ]);
  const groupLabels = getGroupLabels(settings);
  const hero = places.find(place => !place.image.includes("placeholder")) ?? places[0];
  const heroImage = hero ? getPlaceImageUrl(hero.image) : "/images/place-placeholder.svg";
  const visits = places.flatMap(place => place.visits);
  const chronology = buildVisitTimeline(places, events);
  const needle = term.toLocaleLowerCase();
  const listings = places.map(place => ({ ...place, groups: placeVisitGroups(place.visits) }));
  const filtered = listings.filter(place => (!group || place.groups.includes(group)) &&
    [place.name, place.region, place.city, place.province, place.country].some(value => value?.toLocaleLowerCase().includes(needle)));

  return (
    <div className={`travel-visited ${styles.archive}`}>
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <main>
      <TravelMotion />
      <section className={`cinematic-archive ${styles.hero}`} aria-labelledby="atlas-cover-title">
        <Image className="cinematic-backdrop" src={heroImage} alt="" fill preload unoptimized sizes="100vw" style={hero ? { objectPosition: coverPosition(hero) } : undefined} />
        <div className="cinematic-vignette" aria-hidden="true" />
        <div className={`cinematic-archive-inner page-width ${styles.heroInner}`}>
          <h1 id="atlas-cover-title">去过的<em>地方</em></h1>
          <p>{places.length} 个地点 · {visits.length} 次到访</p>
          <nav className={styles.heroNav} aria-label="浏览足迹">
            <a href="#place-atlas">地点目录 ↓</a>
            <a href="#timeline">时间轴</a>
            <a href="#footprint-map">地图</a>
          </nav>
        </div>
      </section>

      <section className={`atlas-gallery page-width ${styles.directory}`} id="place-atlas" aria-labelledby="atlas-gallery-title">
        <div className={styles.directoryHead}>
          <div>
            <h2 id="atlas-gallery-title">地点目录</h2>
            {term || group ? <p>找到 {filtered.length} 个地点</p> : null}
          </div>
          <form className={styles.filter} role="search" action="/visited#place-atlas">
            <input type="search" name="q" maxLength={100} defaultValue={term} aria-label="搜索地点或地区" placeholder="搜索地点或地区" />
            <select name="group" defaultValue={group ?? ""} aria-label="按同行人筛选">
              <option value="">全部同行人</option>
              {VISIT_GROUPS.map(item => <option value={item} key={item}>{groupLabels[item]}</option>)}
            </select>
            <button type="submit">查找</button>
            {term || group ? <Link href="/visited#place-atlas">清除</Link> : null}
          </form>
        </div>
        {!filtered.length ? <p className={styles.empty}>{places.length ? "没有符合这些筛选条件的地点。" : "你们的足迹会从第一个地点开始。"}</p> : null}
        <div className="atlas-photo-grid">
          {filtered.map((place, index) => {
            const matchingVisits = group ? place.visits.filter(visit => visit.group === group) : place.visits;
            const recent = latestPlaceVisit(matchingVisits);
            return <Link className={`atlas-photo-entry${index === 0 ? " is-lead" : ""} ${styles.card}`} href={`/visited/${encodeURIComponent(place.id)}`} key={place.id}>
              <div className="atlas-photo-frame">
                <Image unoptimized src={photoPreviewUrl(getPlaceImageUrl(place.image), 960)} alt="" fill sizes="(max-width: 680px) 100vw, (max-width: 1000px) 50vw, 33vw" style={{ objectPosition: coverPosition(place) }} />
              </div>
              <div className="atlas-photo-text">
                <div><small>{place.region}</small><h3>{place.name}</h3><p>{matchingVisits.length} 次到访{recent ? ` · ${getVisitDate(recent).label}` : ""}</p></div>
                <span aria-hidden="true" className={styles.cardArrow}>↗</span>
              </div>
            </Link>;
          })}
        </div>
      </section>

      <section className={`atlas-timeline ${styles.timeline}`} id="timeline" aria-labelledby="atlas-timeline-title">
        <div className="page-width">
          <h2 id="atlas-timeline-title">旅行时间轴</h2>
          {!chronology.length ? <p className={styles.empty}>还没有到访记录。</p> : null}
          {chronology.map(([year, items]) => <section className="atlas-year" key={year}>
            <h3 className={styles.year}>{year || "日期待补充"}</h3>
            <div className="atlas-year-entries">
              {items.map(item => {
                const place = item.places[0];
                const note = item.note.trim();
                return <article className={`atlas-entry ${styles.timelineEntry}`} key={item.id}>
                  <time className="atlas-entry-date" dateTime={item.dateTime}>{item.date}</time>
                  {place ? <div className="cinematic-entry-thumb">
                    <Image src={photoPreviewUrl(getPlaceImageUrl(place.image), 320)} alt="" fill unoptimized sizes="120px" style={{ objectPosition: coverPosition(place) }} />
                  </div> : <div className="cinematic-entry-thumb"><span aria-hidden="true">✳</span></div>}
                  <div>
                    <p className="atlas-entry-group">{visitGroupLabel(groupLabels, item.group)}</p>
                    <h4>{item.title}</h4>
                    {note ? <p className={styles.excerpt}>{note.slice(0, 150)}{note.length > 150 ? "…" : ""}</p> : null}
                    <div className="atlas-entry-links">
                      {item.places.map(link => <Link key={link.id} href={`/visited/${encodeURIComponent(link.id)}${item.visitId ? `#visit-${item.visitId}` : ""}`}>
                        {item.visitId ? "查看这次到访" : link.name} ↗
                      </Link>)}
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </section>)}
        </div>
      </section>

      <section className={`cinematic-map-band ${styles.map}`} id="footprint-map" aria-labelledby="map-title">
        <div className="atlas-map-wrap page-width">
          <h2 id="map-title">足迹地图</h2>
          {listings.length ? <VisitedMap places={listings.map(({ id, name, groups, longitude, latitude, country, province, city, mapNote }) => ({
            id, name, groups, longitude, latitude, country, province, city, mapNote,
          }))} groupLabels={groupLabels} /> : <p className={styles.mapEmpty}>记录第一个地点的坐标后，地图会显示你们的足迹。</p>}
        </div>
      </section>
      </main>
      <footer className="editorial-footer page-width"><Link href="/">← 返回首页</Link><Link href="#place-atlas">地点目录 ↑</Link><span>{settings.siteName}</span></footer>
    </div>
  );
}
