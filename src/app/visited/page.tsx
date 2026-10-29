import Image from "next/image";
import Link from "next/link";
import { VisitedMap } from "@/components/visited-map";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const groupLabel: Record<string, string> = {
  both: "我们都去过",
  her: "王颖单独去过",
  mine: "我单独去过",
};

export default async function VisitedPage() {
  const [places, timeline] = await Promise.all([
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.timelineEntry.findMany({
      orderBy: [{ year: "asc" }, { sortOrder: "asc" }],
      include: { places: { orderBy: { sortOrder: "asc" }, include: { place: true } } },
    }),
  ]);
  const bothCount = places.filter((place) => place.group === "both").length;
  const herCount = places.filter((place) => place.group === "her").length;
  const mineCount = places.filter((place) => place.group === "mine").length;
  const years = [...new Set(timeline.map((event) => event.year))].sort((a, b) => b - a);

  return (
    <main>
      <SiteHeader />
      <section className="visited-hero">
        <Image src="/images/visited/sichuan.jpg" alt="川西旅行风景" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="visited-hero-content page-width">
          <p className="eyebrow eyebrow-light">OUR TRAVEL ARCHIVE · VOL. 01</p>
          <h1>有些地方，<br /><em>已经去过。</em></h1>
          <p>把一起走过的路和各自看过的风景，<br />慢慢拼成属于两个人的地图。</p>
          <Link className="button button-light" href="/#destinations">继续挑选下一站 ↗</Link>
        </div>
      </section>

      <section className="page-width section-block">
        <div className="section-heading">
          <div><p className="eyebrow">COLLECTED PLACES · NOT CHECKLISTS</p><h2>所有走过的路，<em>慢慢拼成我们的地图。</em></h2></div>
          <p>“我们都去过”表示双方各自曾到访，不一定结伴同行。生活足迹和旅行记录分开理解，没有记录的月份不会凭空补上。</p>
        </div>
        <div className="stats-row visited-stats">
          <div><strong>{places.length}</strong><span>个足迹地点</span></div>
          <div><strong>{bothCount}</strong><span>双方都去过</span></div>
          <div><strong>{herCount}</strong><span>王颖单独去过</span></div>
          <div><strong>{mineCount}</strong><span>我单独去过</span></div>
          <div><strong>{timeline.length}</strong><span>条时间轴记录</span></div>
        </div>
        <VisitedMap places={places.map((place) => ({
          id: place.id,
          name: place.name,
          group: place.group,
          longitude: place.longitude,
          latitude: place.latitude,
          country: place.country,
          province: place.province,
          city: place.city,
          mapNote: place.mapNote,
        }))} />
      </section>

      <section className="page-width section-block" id="place-atlas">
        <div className="section-heading">
          <div><p className="eyebrow">PLACE ATLAS</p><h2>我们走过的<em>每一个地方。</em></h2></div>
          <p>地点保留原始归属和时间备注。后续可以在管理后台新增记录、修正日期与补充自己的旅行照片。</p>
        </div>
        <div className="place-grid">
          {places.map((place, index) => (
            <article className="place-card" id={`place-${place.id}`} key={place.id}>
              <div className="place-photo">
                <Image unoptimized={place.image.startsWith("api/media/")} src={`/${place.image.replace(/^\//, "")}`} alt={place.image.endsWith(".svg") ? `${place.name}主题示意插画（非实景照片）` : `${place.name}代表性景观照片`} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw" />
                <span className="place-index">{String(index + 1).padStart(2, "0")}</span>
                <span className={`group-chip group-${place.group}`}>{groupLabel[place.group] ?? "已到访"}</span>
              </div>
              <div className="place-card-body">
                <p className="place-region">{place.region}</p>
                <h3>{place.name}</h3>
                <p className="place-when">{place.whenLabel || "到访日期未记录"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="timeline-section">
        <div className="page-width section-block">
          <div className="section-heading"><div><p className="eyebrow">OUR TIMELINE</p><h2>旅行的时间，<em>也值得被记住。</em></h2></div><p>只显示已经发生的记录。年份已知但月份不详的事件，会明确显示“月未详”。</p></div>
          <div className="timeline-layout">
            {years.map((year) => {
              const events = timeline.filter((event) => event.year === year);
              return (
                <section className="timeline-year" key={year}>
                  <div className="timeline-year-heading"><span>YEAR</span><strong>{year}</strong><small>{String(events.length).padStart(2, "0")} RECORDS</small></div>
                  <div className="timeline-events">
                    {events.map((event) => (
                      <article className="timeline-event" key={event.id}>
                        <div className="timeline-date"><strong>{event.date.includes(".") ? event.date.split(".")[1] : "—"}</strong><span>{event.date.includes(".") ? event.date.split(".")[0] : "月未详"}</span></div>
                        <div className="timeline-event-copy">
                          <div className="timeline-event-meta"><span className={`group-dot group-${event.group}`} />{groupLabel[event.group] ?? "已到访"} · {event.date}</div>
                          <h3>{event.title}</h3>
                          <p>{event.note}</p>
                          <div className="timeline-place-links">{event.places.map(({ place }) => <Link key={place.id} href={`#place-${place.id}`}>{place.name}</Link>)}</div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>
      <footer className="site-footer page-width"><Link className="text-link" href="/">← 回到未来旅行规划</Link><p>每一段旅程，都留下了自己的位置。</p></footer>
    </main>
  );
}
