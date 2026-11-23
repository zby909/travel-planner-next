"use client";

import { purgePlaceVisitAction, restorePlaceVisitAction } from "./story-actions";

// 回收站保留媒体占用，只有明确选择彻底删除后才释放文件。
export function VisitTrash({ placeId, visits }: { placeId: string; visits: { id: string; label: string; title: string; photos: number }[] }) {
  if (!visits.length) return null;
  return <details className="admin-disclosure" id="visit-trash">
    <summary>回收站 · {visits.length} 次到访</summary>
    <section className="admin-panel">
      <p className="muted-copy">照片仍计入地点容量，恢复后会回到原来的时间位置。</p>
      <div className="admin-list">{visits.map(visit => <article className="admin-list-item" key={visit.id}>
        <div><strong>{visit.title || visit.label}</strong><span>{visit.label} · {visit.photos} 张照片</span></div>
        <div className="admin-links">
          <form action={restorePlaceVisitAction}><input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visit.id} />
            <button type="submit" className="button button-dark">恢复到访</button>
          </form>
          <form action={purgePlaceVisitAction} onSubmit={event => {
            if (!window.confirm(`彻底删除这次到访和相册中的 ${visit.photos} 张照片吗？此操作无法通过回收站恢复。`)) event.preventDefault();
          }}><input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="visitId" value={visit.id} />
            <button type="submit" className="admin-text-action">彻底删除</button>
          </form>
        </div>
      </article>)}</div>
    </section>
  </details>;
}
