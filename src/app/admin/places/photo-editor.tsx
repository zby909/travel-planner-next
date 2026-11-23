"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlacePhotoUrl, photoPreviewUrl } from "@/lib/media";
import { deletePlaceStoryPhotoAction, setPlaceCoverFromAlbumAction } from "./story-actions";
import { saveVisitAlbumAction } from "./album-actions";
import { useEditorReady } from "./use-visit-draft";
import styles from "./photo-editor.module.css";

export type EditablePhoto = {
  id: string; filePath: string; altText: string | null; isFeatured: boolean;
  mediaAsset: { id: string; status: string; fileName: string; width: number | null; height: number | null } | null;
};

// 实时预览封面焦点，照片自身保持完整构图。
function CoverCropForm({ placeId, visitId, photo, position }: {
  placeId: string; visitId: string; photo: EditablePhoto; position: { x: number; y: number };
}) {
  const [x, setX] = useState(position.x);
  const [y, setY] = useState(position.y);
  const src = getPlacePhotoUrl(photo);
  if (!src || !photo.mediaAsset) return null;
  return <details className={styles.crop}>
    <summary>设为封面 / 调整构图</summary>
    <form action={setPlaceCoverFromAlbumAction}>
      <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="photoId" value={photo.id} />
      <div className={styles.cropPreview}><Image src={photoPreviewUrl(src, 640)} alt="封面构图预览" fill unoptimized style={{ objectPosition: `${x}% ${y}%` }} sizes="400px" /></div>
      <label>横向焦点<input type="range" min={0} max={100} name="coverX" value={x} onChange={event => setX(Number(event.target.value))} /></label>
      <label>纵向焦点<input type="range" min={0} max={100} name="coverY" value={y} onChange={event => setY(Number(event.target.value))} /></label>
      <button className="button button-dark" type="submit">设为封面</button>
    </form>
  </details>;
}

// 拖动或使用按钮整理照片，说明和首页精选随相册一起保存。
export function PhotoEditor({ placeId, visitId, revision, photos, cover }: {
  placeId: string; visitId: string; revision: number; photos: EditablePhoto[]; cover: { mediaId: string | null; x: number; y: number };
}) {
  const router = useRouter();
  const ready = useEditorReady();
  const [draft, setDraft] = useState<{ base: EditablePhoto[]; items: EditablePhoto[]; revision: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);
  // 兼容末尾追加新图或单独删图：只要剩余原图的服务端元数据与相对顺序未变，就保留本地未保存的配文与排序。
  const currentById = new Map(photos.map(photo => [photo.id, photo]));
  const baseIds = new Set(draft?.base.map(photo => photo.id) ?? []);
  const survivingBase = draft ? draft.base.filter(photo => currentById.has(photo.id)) : [];
  const prefixMatches = draft ? survivingBase.every((photo, index) => {
    const server = photos[index];
    return server && server.id === photo.id && server.altText === photo.altText && server.isFeatured === photo.isFeatured;
  }) : false;
  const trailingAdded = draft ? photos.slice(survivingBase.length) : [];
  const canReconcile = Boolean(draft && prefixMatches && trailingAdded.every(photo => !baseIds.has(photo.id)));
  const conflict = Boolean(draft && draft.revision !== revision && !canReconcile);
  const items = draft
    ? (canReconcile
      ? [...draft.items.filter(item => currentById.has(item.id)), ...trailingAdded]
      : draft.items)
    : photos;

  // 首次修改时固定版本，服务端的其他编辑不能替换未保存的文字。
  function changeItems(next: EditablePhoto[]) {
    setDraft({ base: conflict && draft ? draft.base : photos, revision: conflict && draft ? draft.revision : revision, items: next });
  }

  // 调整后将目标位置作为下一次保存的顺序。
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to || from < 0) return;
    const next = [...items];
    const [photo] = next.splice(from, 1);
    next.splice(to, 0, photo);
    changeItems(next);
  }

  // 保持失败时的本地排列，成功后读取服务器的新版本。
  async function save(previous: { error: string; saved: boolean }, form: FormData) {
    setDismissedError(false);
    const result = await saveVisitAlbumAction(previous, form);
    if (result.saved) setDraft(null);
    else router.refresh();
    return result;
  }

  const [state, action, pending] = useActionState(save, { error: "", saved: false });
  if (!items.length && !draft) return null;
  return <div>
    <form action={action} className={styles.saveRow}>
      <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="albumRevision" value={conflict ? draft?.revision : revision} />
      <input type="hidden" name="photos" value={JSON.stringify(items.map(photo => ({ id: photo.id, caption: photo.altText ?? "", featured: photo.isFeatured })))} />
      <button className="button button-dark" type="submit" disabled={!ready || pending || !draft || conflict}>{pending ? "保存中…" : "保存相册整理"}</button>
      {draft ? <small>顺序、说明和精选有未保存的修改</small> : state.saved ? <p className="form-success" role="status">相册整理已保存。</p> : null}
      {conflict ? <>
        <p className="form-error" role="alert">相册已被修改。当前草稿仍在，请先复制要保留的说明，再载入最新相册。</p>
        <button type="button" className="button" onClick={() => { if (window.confirm("放弃当前相册草稿并载入最新内容吗？")) { setDraft(null); setDismissedError(true); } }}>载入最新相册</button>
      </> : draft && state.error && !dismissedError ? <p className="form-error" role="alert">{state.error}</p> : null}
    </form>
    <div className={`memory-admin-photos place-gallery-grid ${styles.grid}`}>
      {items.map((photo, index) => {
        const src = getPlacePhotoUrl(photo);
        return <div className={`memory-admin-photo ${styles.card}`} key={photo.id} onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); move(items.findIndex(item => item.id === dragging), index); setDragging(null); }}>
          <div className={styles.image}>
            {src ? <Image src={photoPreviewUrl(src, 640)} alt={photo.altText || "旅行照片"} fill unoptimized sizes="400px" /> : <span>这张旧照片暂时无法预览</span>}
            {photo.mediaAsset?.id === cover.mediaId ? <span className={styles.coverLabel}>地点封面</span> : null}
          </div>
          <div className={styles.controls}>
            <button type="button" className={styles.dragHandle} draggable={!pending} onDragStart={() => setDragging(photo.id)} onDragEnd={() => setDragging(null)} aria-label={`拖动第 ${index + 1} 张照片排序`}>⠿ 拖动排序</button>
            <button type="button" disabled={pending || index === 0} onClick={() => move(index, index - 1)} aria-label={`上移第 ${index + 1} 张照片`}>↑</button>
            <button type="button" disabled={pending || index === items.length - 1} onClick={() => move(index, index + 1)} aria-label={`下移第 ${index + 1} 张照片`}>↓</button>
          </div>
          <label className={styles.caption}>照片说明<textarea maxLength={500} rows={2} disabled={!ready || pending} value={photo.altText ?? ""} onChange={event => {
            changeItems(items.map(item => item.id === photo.id ? { ...item, altText: event.target.value } : item));
          }} /></label>
          <label className={styles.featured}><input type="checkbox" disabled={!ready || pending} checked={photo.isFeatured} onChange={event => {
            changeItems(items.map(item => item.id === photo.id ? { ...item, isFeatured: event.target.checked } : item));
          }} />首页精选</label>
          <CoverCropForm key={`${photo.id}:${photo.mediaAsset?.id === cover.mediaId ? `${cover.x}:${cover.y}` : "default"}`} placeId={placeId} visitId={visitId} photo={photo} position={photo.mediaAsset?.id === cover.mediaId ? cover : { x: 50, y: 50 }} />
          <form action={deletePlaceStoryPhotoAction} className={styles.delete} onSubmit={event => {
            if (!window.confirm("确定移除这张照片吗？")) event.preventDefault();
          }}>
            <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visitId} /><input type="hidden" name="id" value={photo.id} />
            <button type="submit">移除照片</button>
          </form>
        </div>;
      })}
    </div>
  </div>;
}
