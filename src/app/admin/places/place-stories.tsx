"use client";

import { type VisitGroupLabels } from "@/lib/place-visits";
import { deletePlaceVisitAction } from "./story-actions";
import { PhotoUploader } from "./photo-uploader";
import { VisitNoteForm, type EditableVisit } from "./visit-note-form";
import { PhotoEditor, type EditablePhoto } from "./photo-editor";

// 每次到访分别编辑手记和相册，各自使用版本号保护共同编辑。
export function PlaceAlbum({ placeId, visit, groupLabels, cover, usage, limits, status, requestId, userId }: {
  placeId: string;
  visit: (EditableVisit & { albumRevision: number; photos: EditablePhoto[] }) | null;
  groupLabels: VisitGroupLabels;
  cover: { mediaId: string | null; x: number; y: number };
  usage: { count: number; bytes: number };
  limits: { maxPhotos: number; maxBytes: number };
  status: string | null;
  requestId: string;
  userId: string;
}) {
  return <section id="place-journal" className="admin-panel place-stories-section">
    <div className="timeline-editor-heading">
      <h2>{visit ? "编辑这次到访" : "记录一次到访"}</h2>
      {visit ? <span className="admin-panel-count">{visit.photos.length} 张照片</span> : null}
    </div>
    {status ? <p className="form-success" role="status">{status}</p> : null}
    <VisitNoteForm key={`${visit?.id ?? "new"}:${visit?.revision ?? 0}`} placeId={placeId} visit={visit} requestId={requestId} userId={userId} labels={groupLabels} />
    {visit ? <>
      <div className="place-gallery-upload">
        <h3>这次的相册</h3>
        <PhotoUploader placeId={placeId} visitId={visit.id} usage={usage} limits={limits} />
        <PhotoEditor placeId={placeId} visitId={visit.id} revision={visit.albumRevision} photos={visit.photos} cover={cover} />
      </div>
      <form action={deletePlaceVisitAction} className="place-delete-visit" onSubmit={event => {
        if (!window.confirm("将这次到访移入回收站吗？手记和相册可在回收站恢复。")) event.preventDefault();
      }}>
        <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visit.id} />
        <button type="submit" className="source-link">删除这次到访</button>
      </form>
    </> : <p className="muted-copy">保存后即可上传这次旅行的照片。</p>}
  </section>;
}
