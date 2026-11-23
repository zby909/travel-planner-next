"use client";

import { useActionState, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { VISIT_GROUPS, type VisitGroupLabels } from "@/lib/place-visits";
import { savePlaceStoryAction, type StoryFormState } from "./story-actions";
import { useEditorReady, useVisitDraft } from "./use-visit-draft";

export type EditableVisit = {
  id: string; title: string; content: string; happenedAt: Date | null;
  whenLabel: string; group: string | null; revision: number;
};

// 保留本机草稿并检查手记版本，保存成功后打开对应到访。
export function VisitNoteForm({ placeId, visit, requestId, userId, labels }: {
  placeId: string; visit: EditableVisit | null; requestId: string; userId: string; labels: VisitGroupLabels;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const ready = useEditorReady();
  const [creationId, setCreationId] = useState(requestId);
  const [fields, setFields] = useState<Record<string, string>>({
    happenedAt: visit?.happenedAt?.toISOString().slice(0, 10) ?? "", group: visit ? visit.group ?? "" : "both",
    whenLabel: visit?.whenLabel ?? "", title: visit?.title ?? "", content: visit?.content ?? "",
  });
  const draft = useVisitDraft(
    formRef,
    `travel-draft:${userId}:${visit?.id ?? `new-${placeId}`}`,
    visit?.revision ?? 0,
    (values, restoredRequestId) => {
      setFields(values);
      if (!visit && restoredRequestId) setCreationId(restoredRequestId);
    },
    visit ? undefined : creationId,
  );

  // 受控字段在服务端拒绝保存时仍保留当前文字。
  function update(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFields(previous => ({ ...previous, [name]: value }));
  }

  // 服务端确认保存后清理草稿，再刷新到访的最新版本。
  async function save(previous: StoryFormState, form: FormData) {
    const result = await savePlaceStoryAction(previous, form);
    if (!result.error && result.visitId) {
      draft.clear();
      router.replace(`/admin/places/${encodeURIComponent(placeId)}?visit=${encodeURIComponent(result.visitId)}&noteSaved=1#place-journal`);
      router.refresh();
    }
    return result;
  }

  const [state, action, pending] = useActionState(save, { error: "" });
  return <>
    {draft.draft ? <div className="visit-draft-notice" role="status">
      <p>{draft.draft.revision !== (visit?.revision ?? 0) ? "本机留有较早版本的草稿，可恢复到表单中核对后再保存。" : "这个标签页留有未保存的草稿。"}</p>
      <button type="button" onClick={draft.restore}>恢复草稿</button>
      <button type="button" onClick={draft.clear}>丢弃草稿</button>
    </div> : null}
    <form ref={formRef} action={action} onChange={draft.remember} className="admin-form memory-form place-note-form">
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="visitId" value={visit?.id ?? ""} />
      <input type="hidden" name="requestId" value={creationId} />
      <input type="hidden" name="revision" value={state.revision ?? visit?.revision ?? 0} />
      <fieldset className="visit-note-fields" disabled={!ready || pending}>
      <div className="admin-form-grid">
        <label>到访日期<input type="date" name="happenedAt" value={fields.happenedAt} onChange={update} /></label>
        <label>同行人<select name="group" value={fields.group} onChange={update}>
          {VISIT_GROUPS.map(group => <option key={group} value={group}>{labels[group]}</option>)}
          <option value="">待补充</option>
        </select></label>
        <label>日期说明（可选）<input name="whenLabel" maxLength={240} value={fields.whenLabel} onChange={update} placeholder="例如：2026 年秋天" /></label>
        <label>手记标题（可选）<input name="title" maxLength={150} value={fields.title} onChange={update} /></label>
      </div>
      <label>手记<textarea name="content" rows={6} maxLength={20000} value={fields.content} onChange={update} placeholder="写下这次旅行最想记住的事" /></label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="admin-save-row">
        <button type="submit" className="button button-dark" disabled={pending}>{pending ? "保存中…" : "保存到访记录"}</button>
        {draft.dirty ? <small role="status">{draft.stored ? "草稿已保存在此标签页" : "还有未保存的修改"}</small> : null}
      </div>
      </fieldset>
    </form>
  </>;
}
