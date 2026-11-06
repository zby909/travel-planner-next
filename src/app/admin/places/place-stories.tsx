"use client";

import Image from "next/image";
import { useActionState } from "react";
import { deletePlaceStoryPhotoAction, savePlaceStoryAction, setPlaceCoverFromAlbumAction } from "./story-actions";
import { PhotoUploader } from "./photo-uploader";

type PlacePhoto = {
  id: string;
  filePath: string;
  altText: string | null;
  mediaAsset: { id: string; status: string; fileName: string } | null;
};
export type PlaceNote = {
  id: string;
  content: string;
  happenedAt: Date | null;
  photos: PlacePhoto[];
};

// 仅展示具有有效媒体引用的照片，避免旧文件路径注入图片加载。
function photoUrl(photo: PlacePhoto): string | null {
  if (photo.mediaAsset?.status === "PUBLIC" && photo.mediaAsset.fileName === `${photo.mediaAsset.id}.webp`) {
    return `/api/media/${photo.mediaAsset.id}`;
  }
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(photo.filePath) ? photo.filePath : null;
}

// 一个地点只能有一份文字和一个相册，不再添加标题、篇数和多篇故事管理。
export function PlaceAlbum({ placeId, placeName, note, coverMediaId, visibility, archived, saved, photoDeleted, coverSaved }: {
  placeId: string;
  placeName: string;
  note: PlaceNote | null;
  coverMediaId: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  archived: boolean;
  saved: boolean;
  photoDeleted: boolean;
  coverSaved: boolean;
}) {
  const [state, action, pending] = useActionState(savePlaceStoryAction, { error: "" });
  const photos = note?.photos.flatMap(photo => {
    const src = photoUrl(photo);
    return src ? [{ ...photo, src }] : [];
  }) ?? [];
  return <section id="place-stories" className="admin-panel place-stories-section">
    <div className="timeline-editor-heading">
      <div>
        <p className="eyebrow">PLACE NOTE / ALBUM</p>
        <h2>旅行文字与照片</h2>
        <p className="muted-copy">只需写一份记录、上传想留下的照片，之后随时修改。文字和照片独立保存。</p>
      </div>
      <span className="admin-panel-count">{photos.length} 张照片</span>
    </div>
    <p className={`memory-visibility-notice memory-visibility-${visibility.toLowerCase()}`}>
      {archived ? "此地点已归档，文字和照片不会在公开页面显示。" : visibility === "PUBLIC"
        ? "当前站点为公开展示：文字和照片可以被访客看到。"
        : "当前仅成员可见：文字和相册需要登录才能查看。"}
    </p>
    {saved ? <p className="form-success" role="status">旅行文字已保存。</p> : null}
    {photoDeleted ? <p className="form-success" role="status">照片已移除。</p> : null}
    {coverSaved ? <p className="form-success" role="status">地点封面已更新。</p> : null}

    <form action={action} className="admin-form memory-form place-note-form">
      <input type="hidden" name="placeId" value={placeId} />
      <label>到访日期（可选）<input type="date" name="happenedAt" defaultValue={note?.happenedAt?.toISOString().slice(0, 10) ?? ""} /></label>
      <label>关于{placeName}的记录
        <textarea name="content" rows={7} maxLength={20000} defaultValue={note?.content ?? ""}
          placeholder="这里是唯一的一份文字，可以记录这趟旅行里所有值得回忆的事情。" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="admin-save-row">
        <button type="submit" className="button button-dark" disabled={pending}>{pending ? "保存中…" : "保存旅行文字"}</button>
      </div>
    </form>

    <div className="place-gallery-upload">
      <h3>旅行相册</h3>
      <PhotoUploader placeId={placeId} existingCount={photos.length} />
      {photos.length ? <div className="memory-admin-photos place-gallery-grid">
        {photos.map(photo => <div className="memory-admin-photo" key={photo.id}>
          <Image src={photo.src} alt={photo.altText || `${placeName}旅行照片`} fill unoptimized sizes="(max-width:700px) 42vw, 220px" />
          <div className="place-photo-actions">
            {photo.mediaAsset?.id === coverMediaId ? <span className="place-current-cover">当前封面</span> :
              <form action={setPlaceCoverFromAlbumAction}>
                <input type="hidden" name="placeId" value={placeId} />
                <input type="hidden" name="photoId" value={photo.id} />
                <button type="submit" className="memory-photo-delete">设为封面</button>
              </form>}
            <form action={deletePlaceStoryPhotoAction}>
              <input type="hidden" name="placeId" value={placeId} />
              <input type="hidden" name="memoryId" value={note?.id ?? ""} />
              <input type="hidden" name="id" value={photo.id} />
              <button type="submit" className="memory-photo-delete" onClick={event => {
                if (!window.confirm("确定移除这张照片吗？")) event.preventDefault();
              }}>移除照片</button>
            </form>
          </div>
        </div>)}
      </div> : <p className="memory-empty">相册还没有照片。选择照片上传，第一张会自动成为地点封面。</p>}
    </div>
  </section>;
}
