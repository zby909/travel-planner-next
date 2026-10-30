import Image from "next/image";
import Link from "next/link";
import { VisitedMap } from "@/components/visited-map";
import { SiteHeader } from "@/components/site-header";
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
      <section className="atlas-cover" aria-labelledby="atlas-cover-title">
        <div className="atlas-cover-copy">
          <p className="editorial-overline">THE TRAVEL ARCHIVE / VOLUME 01</p>
          <h1 id="atlas-cover-title">去过的地方，<br /><em>后来都成了故事。</em></h1>
          <p>每一处脚印都有自己的时间，每一张照片也有值得留住的光。这里收着我们一起与各自看过的世界。</p>
          <div className="atlas-cover-actions"><Link className="editorial-arrow-link" href="#place-atlas">翻看摄影图录 <span aria-hidden="true">↗</span></Link><Link href="/#destinations">看看下一站 ↗</Link></div>
          <div className="atlas-cover-volume">31° / NORTH OF SOMEWHERE <span>ARCHIVE / EST. NOW</span></div>
        </div>
        <figure className="atlas-cover-photo"><Image src={heroImage} alt={heroPlace ? `${heroPlace.name}旅行摄影` : "待收集的旅行照片"} fill priority unoptimized sizes="(max-width: 760px) 100vw, 56vw" /><figcaption>THE VIEW WE REMEMBER <span>{heroPlace?.name ?? "UNWRITTEN"} / 001</span></figcaption></figure>
      </section>

      <section className="atlas-preface page-width">
        <div><p className="editorial-overline">01 / MAPPING OUR JOURNEY</p><h2>把足迹，<em>连成地图。</em></h2></div>
        <div className="atlas-stat-line">
          <div><strong>{places.length}</strong><span>全部地点</span></div>
          <div><strong>{bothCount}</strong><span>{settings.togetherLabel}</span></div>
          <div><strong>{herCount}</strong><span>{groupLabels.her}</span></div>
          <div><strong>{mineCount}</strong><span>{groupLabels.mine}</span></div>
          <div><strong>{timeline.length}</strong><span>时间记录</span></div>
        </div>
      </section>
      <div className="atlas-map-wrap page-width">
        <VisitedMap places={places.map(place => ({
          id: place.id, name: place.name, group: place.group,
          longitude: place.longitude, latitude: place.latitude,
          country: place.country, province: place.province,
          city: place.city, mapNote: place.mapNote,
        }))} groupLabels={groupLabels} />
      </div>

      <section className="atlas-gallery page-width" id="place-atlas" aria-labelledby="atlas-gallery-title">
        <div className="editorial-section-head">
          <div><p className="editorial-overline">02 / A PHOTOGRAPHIC INDEX</p><h2 id="atlas-gallery-title">我们的<em>风景收藏。</em></h2></div>
          <p>不是打卡清单，而是一页页的地方记忆。<br />每个地点都保留自己的到访时间和故事。</p>
        </div>
        {places.length === 0 && <div className="editorial-empty"><h3>还没有到访记录</h3><p>登录管理后台，添加一个地点，开始你们的旅行图录。</p><Link href="/login">开始记录 ↗</Link></div>}
        <div className="atlas-photo-grid">
          {places.map((place, index) => (
            <article className={`atlas-photo-entry${index === 0 ? " is-lead" : ""}`} id={`place-${place.id}`} key={place.id}>
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
          <div className="editorial-section-head"><div><p className="editorial-overline">03 / CHAPTERS IN TIME</p><h2 id="atlas-timeline-title">时间走过，<em>故事留下。</em></h2></div><p>只展示真实记录过的日期。<br />有些月份还没有写下，我们就保留空白。</p></div>
          <div className="atlas-timeline-list">
            {years.map(year => {
              const events = timeline.filter(event => event.year === year);
              return (
                <section className="atlas-year" key={year}>
                  <div className="atlas-year-label"><span>CHAPTER</span><strong>{year}</strong><small>{String(events.length).padStart(2, "0")} ENTRIES</small></div>
                  <div className="atlas-year-entries">
                    {events.map(event => (
                      <article className="atlas-entry" key={event.id}>
                        <span className="atlas-entry-date">{event.date}</span>
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