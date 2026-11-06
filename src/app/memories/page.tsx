import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { TravelMotion } from "@/components/travel-motion";
import { formatDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/site-settings";
import { requireSiteContentAccess } from "@/lib/site-access";
import { visibleMemoryWhere } from "@/lib/content-visibility";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "旅行故事｜我们的旅行手记",
  description: "把旅途中的照片、地点和小故事，按日期收藏起来。",
};

// 将日记照片限制为已关联的公开媒体资源，避免读取任意磁盘路径。
function safePhotoUrl(photo: {
  filePath: string;
  mediaAsset: { id: string; status: string; fileName: string } | null;
}): string | null {
  if (photo.mediaAsset?.status === "PUBLIC" && photo.mediaAsset.fileName === `${photo.mediaAsset.id}.webp`) {
    return `/api/media/${photo.mediaAsset.id}`;
  }
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(photo.filePath) ? photo.filePath : null;
}

// 按年份聚合去过的地方中的故事与照片；内容只从地点编辑入口维护。
export default async function MemoriesPage() {
  await requireSiteContentAccess("/memories");
  const [settings, records] = await Promise.all([
    getSiteSettings(),
    prisma.travelMemory.findMany({
      where: visibleMemoryWhere,
      orderBy: [{ happenedAt: "desc" }, { createdAt: "desc" }],
      include: {
        plan: { select: { id: true, title: true } },
        place: { select: { id: true, name: true, region: true } },
        photos: {
          orderBy: { sortOrder: "asc" },
          include: { mediaAsset: { select: { id: true, status: true, fileName: true } } },
        },
      },
    }),
  ]);
  const memories = records.map(memory => ({
    ...memory,
    photos: memory.photos.flatMap(photo => {
      const src = safePhotoUrl(photo);
      return src ? [{ id: photo.id, src, alt: photo.altText || memory.title }] : [];
    }),
  }));
  const years = [...new Set(memories.map(memory => memory.happenedAt?.getUTCFullYear() ?? 0))]
    .sort((a, b) => b - a);
  const photoCount = memories.reduce((sum, memory) => sum + memory.photos.length, 0);

  return <main className="travel-memories">
    <SiteHeader brandName={settings.siteName} brandSubtitle={settings.siteSubtitle} />
    <TravelMotion />
    <section className="memory-archive-hero">
      <div className="page-width">
        <p className="editorial-overline">OUR DAYS / OUR LITTLE STORIES</p>
        <h1>把旅途写下来，<br /><em>让日子留下来。</em></h1>
        <p>有些瞬间不在攻略里，也不在地图上。<br />一张照片、几句话，就足够让我们重新回到那一天。</p>
        <div className="memory-archive-stats">
          <span><strong>{memories.length}</strong> 段故事</span>
          <span><strong>{photoCount}</strong> 张照片</span>
        </div>
      </div>
    </section>

    <section className="memory-archive page-width" aria-label="按年份整理的旅行故事">
      <div className="memory-archive-intro">
        <div><p className="editorial-overline">A CHRONICLE OF LITTLE MOMENTS</p><h2>慢慢翻，<em>都是故事。</em></h2></div>
        <Link href="/visited" className="editorial-arrow-link">回到旅行足迹 <span aria-hidden="true">↗</span></Link>
      </div>
      {memories.length ? years.map(year => {
        const entries = memories.filter(memory => (memory.happenedAt?.getUTCFullYear() ?? 0) === year);
        return <section className="memory-year-group" key={year}>
          <div className="memory-year-label"><span>CHAPTER</span><strong>{year || "—"}</strong><small>{entries.length} STORIES</small></div>
          <div className="memory-year-entries">
            {entries.map(memory => (
              <article className="memory-story" key={memory.id}>
                <div className="memory-story-meta">
                  <time dateTime={memory.happenedAt?.toISOString()}>{formatDate(memory.happenedAt)}</time>
                  {memory.plan ? <span>{memory.plan.title}</span> : null}
                  {memory.place ? <Link href={`/visited#place-${memory.place.id}`}>{memory.place.name} ↗</Link> : null}
                </div>
                <h3>{memory.title}</h3>
                {memory.content ? <p className="memory-story-content">{memory.content}</p> : null}
                {memory.photos.length ? <div className="memory-story-photos">
                  {memory.photos.map((photo, index) => <figure key={photo.id}>
                    <Image src={photo.src} alt={photo.alt} fill unoptimized sizes="(max-width: 700px) 88vw, (max-width: 1100px) 42vw, 280px" />
                    <figcaption>FRAME {String(index + 1).padStart(2, "0")}</figcaption>
                  </figure>)}
                </div> : null}
              </article>
            ))}
          </div>
        </section>;
      }) : <div className="memory-archive-empty">
        <span>THE FIRST PAGE IS WAITING</span>
        <h3>还没有留下第一段故事。</h3>
        <p>登录编辑室，在「去过的地方」里写几句话、上传几张照片，就会自动汇集到这里。</p>
        <Link href="/login">进入编辑室 ↗</Link>
      </div>}
    </section>
    <footer className="editorial-footer page-width">
      <Link href="/">← 回到我们的旅行手记</Link>
      <Link href="/visited">翻看去过的地方 ↗</Link>
      <span>{settings.siteName}</span>
    </footer>
  </main>;
}
