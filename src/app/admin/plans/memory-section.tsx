import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  TravelMemoryDeleteForm,
  TravelMemoryForm,
  TravelMemoryPhotoDeleteForm,
} from "./memory-form";

type PlaceOption = { id: string; name: string; region: string };
type MemoryPhoto = {
  id: string;
  filePath: string;
  altText: string | null;
  mediaAssetId: string | null;
  mediaAsset: { id: string; status: string; fileName: string } | null;
};
type MemoryItem = {
  id: string;
  title: string;
  content: string;
  happenedAt: Date | null;
  place: { id: string; name: string; region: string; isArchived: boolean } | null;
  photos: MemoryPhoto[];
};
type MemoryInput = {
  id: string;
  title: string;
  content: string;
  happenedAt: string;
  placeId: string;
  photoCount: number;
};

// 只显示指向受控媒体资源的照片地址，兼容尚未迁移的旧记录。
function memoryPhotoUrl(photo: MemoryPhoto): string | null {
  if (photo.mediaAsset?.status === "PUBLIC" && photo.mediaAsset.fileName === `${photo.mediaAsset.id}.webp`) {
    return `/api/media/${photo.mediaAsset.id}`;
  }
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(photo.filePath) ? photo.filePath : null;
}

// 在旅行计划详情中呈现日记编辑入口、日期故事和多照片图录。
export function TravelMemorySection({ planId, places, memories, visibility, editingMemory, saved, deleted, photoDeleted }: {
  planId: string;
  places: PlaceOption[];
  memories: MemoryItem[];
  visibility: "PUBLIC" | "PRIVATE";
  editingMemory?: MemoryInput;
  saved: boolean;
  deleted: boolean;
  photoDeleted: boolean;
}) {
  const photoCount = memories.reduce((sum, memory) => sum + memory.photos.filter(photo => memoryPhotoUrl(photo)).length, 0);
  return <section className="admin-panel plan-memories-section" id="plan-memories">
    <div className="timeline-editor-heading">
      <div>
        <p className="eyebrow">JOURNAL / LITTLE MOMENTS</p>
        <h2>旅行日记</h2>
        <p className="muted-copy">按日期留下当天的故事，也可以把照片和去过的地点放在一起。</p>
      </div>
      <span className="admin-panel-count">{memories.length} 篇 · {photoCount} 张照片</span>
    </div>
    <p className={`memory-visibility-notice memory-visibility-${visibility.toLowerCase()}`}>
      {visibility === "PUBLIC"
        ? "当前站点为公开展示：未关联归档地点的日记文字和照片会出现在「旅行日记」页面，所有访客都可以浏览。关联归档地点的日记暂只在编辑室保留。"
        : "当前站点为仅成员可见：旅行日记和照片只对登录的情侣成员开放。"}
    </p>
    {saved ? <p className="form-success" role="status">旅行日记已保存。</p> : null}
    {deleted ? <p className="form-success" role="status">旅行日记及关联照片已删除。</p> : null}
    {photoDeleted ? <p className="form-success" role="status">这张旅行照片已移除。</p> : null}

    {editingMemory ? <>
      <div className="memory-form-heading"><h3>编辑旅行日记</h3></div>
      <TravelMemoryForm planId={planId} places={places} initial={editingMemory} />
    </> : <details className="admin-disclosure memory-create-disclosure" open={memories.length === 0}>
      <summary>＋ 写下一篇旅行日记</summary>
      <section className="admin-panel"><TravelMemoryForm planId={planId} places={places} /></section>
    </details>}

    {memories.length ? <div className="memory-admin-list">
      {memories.map(memory => {
        const photos = memory.photos.flatMap(photo => {
          const src = memoryPhotoUrl(photo);
          return src ? [{ ...photo, src }] : [];
        });
        return <article className="memory-admin-card" key={memory.id}>
          <div className="memory-admin-heading">
            <div>
              <span className="eyebrow">{memory.happenedAt ? formatDate(memory.happenedAt) : "日期待补充"}</span>
              <h3>{memory.title}</h3>
              <p>{memory.place ? `${memory.place.name}${memory.place.region ? ` · ${memory.place.region}` : ""}${memory.place.isArchived ? " · 地点已归档，仅在编辑室保留" : ""}` : "未关联到访地点"}</p>
            </div>
            <div className="memory-admin-actions">
              <Link href={`/admin/plans/${planId}?editMemory=${memory.id}`}>编辑</Link>
              <TravelMemoryDeleteForm planId={planId} memoryId={memory.id} />
            </div>
          </div>
          {memory.content ? <p className="memory-admin-content">{memory.content}</p> : null}
          {photos.length ? <div className="memory-admin-photos">
            {photos.map(photo => <div className="memory-admin-photo" key={photo.id}>
              <Image src={photo.src} alt={photo.altText || memory.title} fill unoptimized sizes="(max-width: 700px) 42vw, 220px" />
              <TravelMemoryPhotoDeleteForm planId={planId} memoryId={memory.id} photoId={photo.id} />
            </div>)}
          </div> : <p className="memory-no-photos">还没有照片，可以编辑这篇日记继续添加。</p>}
        </article>;
      })}
    </div> : <p className="memory-empty">还没有旅行日记。旅行结束后，按日期写下几句话、选几张照片，就能慢慢积累成你们的旅行故事。</p>}
  </section>;
}
