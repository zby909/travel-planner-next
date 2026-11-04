"use client";

import { useActionState } from "react";
import { saveTimelineAction, type TimelineFormState } from "./actions";

const INITIAL_STATE: TimelineFormState = { error: "" };

type PlaceOption = { id: string; name: string; region: string; group: string };
type TimelineData = { id: string; date: string; year: number; group: string; title: string; note: string; placeIds: string[] };

// 编辑一条旅行时间记录，并选择它关联的足迹地点。
export function TimelineForm({ places, groupLabels, initial }: { places: PlaceOption[]; groupLabels: { both: string; her: string; mine: string }; initial?: TimelineData }) {
  const [state, action, pending] = useActionState(saveTimelineAction, INITIAL_STATE);
  return (
    <form action={action} className="admin-form timeline-form">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="admin-form-grid">
        <label>时间描述<input name="date" required defaultValue={initial?.date ?? ""} placeholder="例如：2025.10 或 2025.10.01" /></label>
        <label>所属年份<input name="year" type="number" required min={1900} max={2200} defaultValue={initial?.year ?? new Date().getFullYear()} /></label>
        <label>旅行归属<select name="group" defaultValue={initial?.group ?? "both"}><option value="both">{groupLabels.both}</option><option value="her">{groupLabels.her}</option><option value="mine">{groupLabels.mine}</option></select></label>
        <label>事件标题<input name="title" required maxLength={120} defaultValue={initial?.title ?? ""} placeholder="例如：第一次一起去京都" /></label>
      </div>
      <label>故事与备注<textarea name="note" rows={4} maxLength={4000} defaultValue={initial?.note ?? ""} placeholder="记录这段旅程发生了什么" /></label>
      <fieldset className="timeline-place-picker">
        <legend>关联足迹地点</legend>
        <p className="muted-copy">可多选；关联后，公开时间轴会显示对应地点入口。</p>
        {places.length ? <div className="timeline-place-options">{places.map(place => (
          <label key={place.id}>
            <input type="checkbox" name="placeIds" value={place.id} defaultChecked={initial?.placeIds.includes(place.id) ?? false} />
            <span><strong>{place.name}</strong><small>{place.region} · {groupLabels[place.group as keyof typeof groupLabels] ?? "已到访"}</small></span>
          </label>
        ))}</div> : <p className="muted-copy">还没有足迹地点，可以先到「旅行足迹」新增地点。</p>}
      </fieldset>
      <div className="admin-save-row">
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : initial ? "保存时间记录" : "新增时间记录"}</button>
      </div>
    </form>
  );
}

// 删除前向用户确认，避免误删旅行记录。
export function DeleteTimelineButton() {
  return <button className="admin-danger" type="submit" onClick={event => {
    if (!window.confirm("确定删除这条旅行时间记录吗？关联关系也会一起删除。")) event.preventDefault();
  }}>删除</button>;
}
