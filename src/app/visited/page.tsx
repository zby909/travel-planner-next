import Image from "next/image";
import Link from "next/link";
import { VisitedMap } from "@/components/visited-map";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { getPlaceImageUrl } from "@/lib/media";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 将足迹地图、摄影图录和时间轴串联成可以翻阅的旅行特刊。
export default async function VisitedPage() {
  const [settings, places, timeline] = await Promise.all([
    getSiteSettings(),
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.timelineEntry.findMany({
      orderBy: [{ year: "asc" }, { sortOrder: "asc" }],
      include: { places: { orderBy: { sortOrder: "asc" }, include: { place: true } } },
    }),
  ]);
  const groupLabels = getGroupLabels(settings);
  const heroPlace = places.find(place => place.id === "fuji") ?? places[0];
  const heroImage = heroPlace ? getPlaceImageUrl(heroPlace.image) : "/images/place-placeholder.svg";
  const bothCount = places.filter(place => place.group === "both").length;
  const herCount = places.filter(place => place.group === "her").length;
  const mineCount = places.filter(place => place.group === "mine").length;
  const years = [...new Set(timeline.map(event => event.year))].sort((a, b) => b - a);

  return (
    <main className="travel-visited">
      <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
      <TravelMotion />
      <section className="cinematic-archive" aria-labelledby="atlas-cover-title">
        <Image className="cinematic-backdrop" src={heroImage} alt="" fill priority unoptimized sizes="100vw" />
        <div className="cinematic-vignette" aria-hidden="true" />
        <div className="cinematic-archive-inner page-width">
          <p className="cinematic-kicker"><span /> OUR TRAVEL ARCHIVE <span /> VOL. 01</p>
          <h1 id="atlas-cover-title">有些地方，<br /><em>已经去过。</em></h1>
          <p>有些路一起走，有些风景各自看过。<br />留在地图上的每一个点，都是认真生活过的证据。</p>
          <div className="cinematic-actions">
            <a className="cinematic-main-cta" href="#place-atlas">翻开我们的相册 <span aria-hidden="true">↗</span></a>
            <Link className="cinematic-secondary-cta" href="/#destinations">看看下一站 ↗</Link>
          </div>
          <span className="cinematic-archive-plate">THE PLACES WE HAVE BEEN / {heroPlace?.name ?? "OUR FIRST CHAPTER"}</span>
        </div>
      </section>

      <section className="atlas-preface page-width">
        <div data-motion="rise"><p className="editorial-overline">01 / MAPPING OUR JOURNEY</p><h2>把足迹，<em>连成地图。</em></h2></div>
        <div className="atlas-stat-line" data-motion="rise">
          <div><strong>{places.length}</strong><span>全部地点</span></div>
          <div><strong>{bothCount}</strong><span>{settings.togetherLabel}</span></div>
          <div><strong>{herCount}</strong><span>{groupLabels.her}</span></div>
          <div><strong>{mineCount}</strong><span>{groupLabels.mine}</span></div>
          <div><strong>{timeline.length}</strong><span>时间记录</span></div>
        </div>
      </section>
      <section className="cinematic-map-band"><div className="atlas-map-wrap page-width" data-motion="rise">
        <VisitedMap places={places.map(place => ({
          id: place.id, name: place.name, group: place.group,
          longitude: place.longitude, latitude: place.latitude,
          country: place.country, province: place.province,
          city: place.city, mapNote: place.mapNote,
        }))} groupLabels={groupLabels} />
      </div></section>

      <section className="atlas-gallery page-width" id="place-atlas" aria-labelledby="atlas-gallery-title">
        <div className="editorial-section-head" data-motion="rise">
          <div><p className="editorial-overline">02 / A PHOTOGRAPHIC INDEX</p><h2 id="atlas-gallery-title">我们的<em>风景收藏。</em></h2></div>
          <p>不是打卡清单，而是一页页的地方记忆。<br />每个地点都保留自己的到访时间和故事。</p>
        </div>
        {places.length === 0 && <div className="editorial-empty"><h3>还没有到访记录</h3><p>登录管理后台，添加一个地点，开始你们的旅行图录。</p><Link href="/login">开始记录 ↗</Link></div>}
        <div className="atlas-photo-grid">
          {places.map((place, index) => (
            <article className={`atlas-photo-entry${index === 0 ? " is-lead" : ""}`} id={`place-${place.id}`} data-motion="rise" key={place.id}>
              <div className="atlas-photo-frame">
                <Image unoptimized src={getPlaceImageUrl(place.image)} alt={place.image.endsWith(".svg") ? `${place.name}主题示意插画（非实景照片）` : `${place.name}代表性旅行照片`} fill sizes="(max-width: 680px) 100vw, (max-width: 1000px) 50vw, 33vw" />
                <span>FRAME {String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="atlas-photo-text"><div><small>{place.region || place.country || "TRAVEL NOTES"}</small><h3>{place.name}</h3><p>{place.whenLabel || "到访时间未记录"}</p></div><span className={`atlas-group atlas-group-${place.group}`}>{groupLabels[place.group as keyof typeof groupLabels] ?? "已到访"}</span></div>
            </article>
          ))}
        </div>
      </section>
      <section className="atlas-timeline" id="timeline" aria-labelledby="atlas-timeline-title">
        <div className="page-width">
          <div className="editorial-section-head" data-motion="rise"><div><p className="editorial-overline">03 / CHAPTERS IN TIME</p><h2 id="atlas-timeline-title">时间走过，<em>故事留下。</em></h2></div><p>只展示真实记录过的日期。<br />有些月份还没有写下，我们就保留空白。</p></div>
          <div className="atlas-timeline-list">
            {years.map(year => {
              const events = timeline.filter(event => event.year === year);
              return (
                <section className="atlas-year" data-motion="rise" key={year}>
                  <div className="atlas-year-label"><span>CHAPTER</span><strong>{year}</strong><small>{String(events.length).padStart(2, "0")} ENTRIES</small></div>
                  <div className="atlas-year-entries">
                    {events.map(event => (
                      <article className="atlas-entry" key={event.id}>
                        <span className="atlas-entry-date">{event.date}</span>
                        <div className="cinematic-entry-thumb">
                          {event.places[0]?.place
                            ? <Image src={getPlaceImageUrl(event.places[0].place.image)} alt={`${event.places[0].place.name}旅行风景`} fill unoptimized sizes="(max-width: 680px) 90px, 150px" />
                            : <span aria-hidden="true">✳</span>}
                        </div>
                        <div><div className="atlas-entry-group">{groupLabels[event.group as keyof typeof groupLabels] ?? "已到访"}</div><h3>{event.title}</h3><p>{event.note}</p><div className="atlas-entry-links">{event.places.map(({ place }) => <Link key={place.id} href={`#place-${place.id}`}>{place.name} ↗</Link>)}</div></div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>
      <footer className="editorial-footer page-width"><Link href="/">← 回到我们的旅行手记</Link><span>TO ALL THE PLACES WE CALL A MEMORY.</span><span>{settings.siteName}</span></footer>
    </main>
  );
}