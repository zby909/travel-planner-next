"use client";

import { useActionState } from "react";
import { setRecordArchiveAction } from "@/app/admin/archive-actions";

// 说明归档的展示范围和关联影响，并提供可恢复的操作入口。
export function RecordArchiveForm({ id, kind, isArchived, relatedCount }: {
  id: string; kind: "destination" | "place"; isArchived: boolean; relatedCount: number;
}) {
  const [state, action, pending] = useActionState(setRecordArchiveAction, { error: "" });
  return <section className="admin-panel record-archive-panel">
    <h2>{isArchived ? "已归档 · 仅在编辑室保留" : "归档这条记录"}</h2>
    <p className="muted-copy">{kind === "destination"
      ? `归档后从首页和目的地详情下架，${relatedCount} 个关联旅行计划及其日记不受影响。`
      : `归档后从地图、足迹相册下架，${relatedCount} 条关联时间轴或日记也暂停在前台展示。`}
      照片与关联数据不会删除，可随时恢复。归档不是删除已被他人下载的内容。</p>
    <form action={action} className="admin-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="archived" value={String(!isArchived)} />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="admin-save-row"><button type="submit" className="button" disabled={pending}>
        {pending ? "保存中…" : isArchived ? "恢复展示" : "归档记录"}
      </button></div>
    </form>
  </section>;
}
