"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { deletePlaceStoryAction, deletePlaceStoryPhotoAction, savePlaceStoryAction } from "./story-actions";

type StoryPhoto = {
  id: string;
  filePath: string;
  altText: string | null;
  mediaAsset: { id: string; status: string; fileName: string } | null;
};
export type PlaceStory = {
  id: string;
  title: string;
  content: string;
  happenedAt: Date | null;
  photos: StoryPhoto[];
};
type EditStory = { id: string; title: string; content: string; happenedAt: string; photoCount: number };

// 只向相册展示由项目媒体接口管理的照片。
function photoUrl(photo: StoryPhoto): string | null {
  if (photo.mediaAsset?.status === "PUBLIC" && photo.mediaAsset.fileName === `${photo.mediaAsset.id}.webp`) {
    return `/api/media/${photo.mediaAsset.id}`;
  }
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(photo.filePath) ? photo.filePath : null;
}

// 故事可只写文字、只传照片，或者给同一个地点分多次记录。
function PlaceStoryForm({ placeId, placeName, initial }: { placeId: string; placeName: string; initial?: EditStory }) {
  const [state, action, pending] = useActionState(savePlaceStoryAction, { error: "" });
  return <form className="admin-form memory-form" action={action}>
    <input type="hidden" name="placeId" value={placeId} />
    <input type="hidden" name="id" value={initial?.id ?? ""} />
    <div className="admin-form-grid memory-form-grid">
      <label>到访日期（可选）<input type="date" name="happenedAt" defaultValue={initial?.happenedAt ?? ""} /></label>
      <label>故事标题<input name="title" maxLength={120} defaultValue={initial?.title ?? ""} placeholder={`例如：${placeName}的傍晚`} /></label>
    </div>
    <label>想留下的话<textarea name="content" maxLength={4000} rows={4} defaultValue={initial?.content ?? ""} placeholder="写下那天发生的事，哪怕只是一句话。" /></label>
    <label>添加照片<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple />
      <small>单次最多 8 张、合计不超过 8 MiB；一篇故事最多 12 张，可分批追加。自动转 WebP 并删除 GPS/EXIF。</small>
      {initial ? <small>已有 {initial.photoCount} 张照片，本次上传只追加，不会覆盖。</small> : null}
    </label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row">
      {initial ? <Link href={`/admin/places/${placeId}#place-stories`} className="admin-back">取消编辑</Link> : null}
      <button type="submit" className="button button-dark" disabled={pending}>{pending ? "保存中…" : initial ? "保存修改并追加照片" : "保存故事与照片"}</button>
    </div>
  </form>;
}

// 删除前提醒照片也会删除，避免在手机上误触。
function ConfirmStoryDelete({ isPhoto = false }: { isPhoto?: boolean }) {
  return <button type="submit" className={isPhoto ? "memory-photo-delete" : "admin-text-action"}
    onClick={event => {
      if (!window.confirm(isPhoto ? "确定移除这张照片吗？" : "确定删除这篇故事和其中的照片吗？")) event.preventDefault();
    }}>{isPhoto ? "移除照片" : "删除故事"}</button>;
}

// 在同一个到访地点下管理多篇故事及其独立照片。
export function PlaceStories({ placeId, placeName, stories, editing, visibility, archived, saved, deleted, photoDeleted }: {
  placeId: string;
  placeName: string;
  stories: PlaceStory[];
  editing?: EditStory;
  visibility: "PUBLIC" | "PRIVATE";
  archived: boolean;
  saved: boolean;
  deleted: boolean;
  photoDeleted: boolean;
}) {
  const photoCount = stories.reduce((count, story) => count + story.photos.length, 0);
  return <section id="place-stories" className="admin-panel place-stories-section">
    <div className="timeline-editor-heading">
      <div><p className="eyebrow">OUR MEMORIES / PLACE STORIES</p><h2>故事与相册</h2>
        <p className="muted-copy">都放在这个去过的地方里。再次到访，也可以继续写下一篇。</p></div>
      <span className="admin-panel-count">{stories.length} 篇 · {photoCount} 张</span>
    </div>
    <p className={`memory-visibility-notice memory-visibility-${visibility.toLowerCase()}`}>
      {archived ? "地点已经归档，相关故事和照片暂不在公开页面显示。" : visibility === "PUBLIC"
        ? "当前站点公开展示：这里保存的故事和照片可以被访客看到。"
        : "当前仅成员可见：故事和相册需要登录才能浏览。"}
    </p>
    {saved ? <p className="form-success" role="status">故事和照片已保存。</p> : null}
    {deleted ? <p className="form-success" role="status">故事及其照片已删除。</p> : null}
    {photoDeleted ? <p className="form-success" role="status">照片已移除。</p> : null}
    {editing ? <>
      <h3>编辑故事</h3>
      <PlaceStoryForm key={editing.id} placeId={placeId} placeName={placeName} initial={editing} />
    </> : <details className="admin-disclosure memory-create-disclosure" open={stories.length === 0}>
      <summary>＋ 添加一段故事或照片</summary>
      <div className="place-story-form-wrap"><PlaceStoryForm placeId={placeId} placeName={placeName} /></div>
    </details>}
    <div className="memory-admin-list">
      {stories.map(story => {
        const photos = story.photos.flatMap(photo => {
          const src = photoUrl(photo);
          return src ? [{ ...photo, src }] : [];
        });
        return <article className="memory-admin-card" key={story.id}>
          <div className="memory-admin-heading">
            <div><span className="eyebrow">{story.happenedAt ? story.happenedAt.toISOString().slice(0, 10) : "日期待补充"}</span>
              <h3>{story.title}</h3></div>
            <div className="memory-admin-actions">
              <Link href={`/admin/places/${placeId}?editStory=${story.id}#place-stories`}>编辑</Link>
              <form action={deletePlaceStoryAction}>
                <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="id" value={story.id} />
                <ConfirmStoryDelete />
              </form>
            </div>
          </div>
          {story.content ? <p className="memory-admin-content">{story.content}</p> : null}
          {photos.length ? <div className="memory-admin-photos">{photos.map(photo => <div className="memory-admin-photo" key={photo.id}>
            <Image src={photo.src} alt={photo.altText || story.title} fill unoptimized sizes="(max-width:700px) 42vw, 220px" />
            <form action={deletePlaceStoryPhotoAction}>
              <input type="hidden" name="placeId" value={placeId} />
              <input type="hidden" name="memoryId" value={story.id} />
              <input type="hidden" name="id" value={photo.id} />
              <ConfirmStoryDelete isPhoto />
            </form>
          </div>)}</div> : null}
        </article>;
      })}
      {stories.length === 0 ? <p className="memory-empty">还没有故事。写几句话或者选几张照片，就能留下第一份回忆。</p> : null}
    </div>
  </section>;
}
