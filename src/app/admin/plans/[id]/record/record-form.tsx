"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PreservingForm } from "@/components/preserving-form";
import { VISIT_GROUPS, type VisitGroupLabels } from "@/lib/place-visits";
import { recordTravelPlanAction } from "../../record-actions";

// 确认实际日期、同行人和地点后，将计划转换为可继续写手记的到访。
export function RecordPlanForm({ planId, requestId, startDate, places, labels }: {
  planId: string; requestId: string; startDate: string; places: { id: string; name: string; region: string; recorded: boolean; trashed: boolean }[]; labels: VisitGroupLabels;
}) {
  const [state, action, pending] = useActionState(recordTravelPlanAction, { error: "" });
  const [additions, setAdditions] = useState<{ name: string; region: string }[]>([]);
  const [submissionId] = useState(requestId);
  return <PreservingForm action={action} className="admin-form">
    <input type="hidden" name="planId" value={planId} /><input type="hidden" name="newPlaces" value={JSON.stringify(additions)} />
    <input type="hidden" name="requestId" value={submissionId} />
    <section className="admin-panel">
      <h2>这次实际去过哪里？</h2>
      {places.length ? <div className="timeline-place-options">{places.map(place => <label key={place.id}>
        <input type="checkbox" name={place.recorded || place.trashed ? "repeatPlaceIds" : "placeIds"} value={place.id} />
        <span><strong>{place.name}{place.recorded || place.trashed ? " · 再记一次" : ""}</strong><small>{place.region}</small>
          {place.trashed ? <Link href={`/admin/places/${encodeURIComponent(place.id)}#visit-trash`}>在回收站查看</Link> : null}</span>
      </label>)}</div> : null}
      {additions.map((place, index) => <div className="admin-form-grid" key={index}>
        <label>新地点名称<input required maxLength={100} value={place.name} onChange={event => setAdditions(additions.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
        <label>国家 / 地区<input required maxLength={160} value={place.region} onChange={event => setAdditions(additions.map((item, i) => i === index ? { ...item, region: event.target.value } : item))} /></label>
        <button type="button" className="admin-text-action" onClick={() => setAdditions(additions.filter((_, i) => i !== index))}>移除新地点</button>
      </div>)}
      <button type="button" className="button" disabled={additions.length >= 30} onClick={() => setAdditions([...additions, { name: "", region: "" }])}>＋ 添加新地点</button>
    </section>
    <section className="admin-panel">
      <h2>到访信息</h2>
      <div className="admin-form-grid">
        <label>到访日期<input type="date" name="happenedAt" defaultValue={startDate} /></label>
        <label>同行人<select name="group" defaultValue="both">{VISIT_GROUPS.map(group => <option key={group} value={group}>{labels[group]}</option>)}<option value="">待补充</option></select></label>
        <label>日期说明<input name="whenLabel" maxLength={240} placeholder="记不清日期时可填，例如：2026 年秋天" /></label>
      </div>
      <p className="muted-copy">以上信息会带入选中的每个地点，之后可分别调整日期、写手记和上传照片。保存后计划标为已完成。</p>
    </section>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row"><button className="button button-dark" type="submit" disabled={pending}>{pending ? "记录中…" : "保存这次旅行的到访"}</button></div>
  </PreservingForm>;
}
