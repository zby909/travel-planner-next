"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  deleteTravelMemoryAction,
  deleteTravelMemoryPhotoAction,
  saveTravelMemoryAction,
  type MemoryFormState,
} from "./memory-actions";

const INITIAL_STATE: MemoryFormState = { error: "" };

type PlaceOption = { id: string; name: string; region: string };

// 录入或修改某一天的旅行日记，并允许在保存时追加多张照片。
export function TravelMemoryForm({ planId, places, initial }: {
  planId: string;
  places: PlaceOption[];
  initial?: {
    id: string;
    title: string;
    content: string;
    happenedAt: string;
    placeId: string;
    photoCount: number;
  };
}) {
  const [state, action, pending] = useActionState(saveTravelMemoryAction, INITIAL_STATE);
  return <form action={action} className="admin-form memory-form" encType="multipart/form-data">
    <input type="hidden" name="planId" value={planId} />
    <input type="hidden" name="id" value={initial?.id ?? ""} />
    <div className="admin-form-grid memory-form-grid">
      <label>日记标题
        <input name="title" required maxLength={120} defaultValue={initial?.title ?? ""} placeholder="例如：抵达京都的第一天" />
      </label>
      <label>旅行日期
        <input name="happenedAt" type="date" required defaultValue={initial?.happenedAt ?? ""} />
      </label>
      <label>关联到访地点（可选）
        <select name="placeId" defaultValue={initial?.placeId ?? ""}>
          <option value="">暂不关联地点</option>
          {places.map(place => <option key={place.id} value={place.id}>{place.name}{place.region ? ` · ${place.region}` : ""}</option>)}
        </select>
      </label>
    </div>
    <label>当天的故事（可选）
      <textarea name="content" rows={4} maxLength={4000} defaultValue={initial?.content ?? ""} placeholder="写几句当天的风景、遇到的人，或某个想留住的小瞬间。" />
    </label>
    <label>添加照片（可选）
      <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
      <small>JPG、PNG、WebP；单次最多 8 张、总大小不超过 8 MiB。每篇日记最多 12 张，可分次补充。自动压缩并清除 EXIF/GPS。</small>
      {initial ? <small>当前已有 {initial.photoCount} 张照片；本次选择的照片会追加，不会覆盖旧照片。</small> : null}
    </label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row">
      {initial ? <Link className="admin-back" href={`/admin/plans/${planId}`}>取消编辑</Link> : null}
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : initial ? "保存日记并添加照片" : "保存旅行日记"}</button>
    </div>
  </form>;
}

// 删除日记前明确说明关联照片也会一并清理。
export function DeleteTravelMemoryButton() {
  return <button className="admin-text-action" type="submit" onClick={event => {
    if (!window.confirm("确定删除这篇旅行日记吗？关联照片及其文件也会一并删除。")) event.preventDefault();
  }}>删除日记</button>;
}

// 删除单张照片前确认，避免误触清除回忆。
export function DeleteTravelMemoryPhotoButton() {
  return <button className="memory-photo-delete" type="submit" onClick={event => {
    if (!window.confirm("确定删除这张旅行照片吗？")) event.preventDefault();
  }}>移除照片</button>;
}

// 将照片删除动作绑定到具体日记与旅行，避免跨记录删除。
export function TravelMemoryPhotoDeleteForm({ planId, memoryId, photoId }: {
  planId: string;
  memoryId: string;
  photoId: string;
}) {
  return <form action={deleteTravelMemoryPhotoAction}>
    <input type="hidden" name="planId" value={planId} />
    <input type="hidden" name="memoryId" value={memoryId} />
    <input type="hidden" name="id" value={photoId} />
    <DeleteTravelMemoryPhotoButton />
  </form>;
}

// 将日记删除动作绑定到当前旅行计划。
export function TravelMemoryDeleteForm({ planId, memoryId }: { planId: string; memoryId: string }) {
  return <form action={deleteTravelMemoryAction}>
    <input type="hidden" name="planId" value={planId} />
    <input type="hidden" name="id" value={memoryId} />
    <DeleteTravelMemoryButton />
  </form>;
}
