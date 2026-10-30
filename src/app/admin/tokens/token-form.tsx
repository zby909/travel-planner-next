"use client";

import { useActionState } from "react";
import { issueTokenAction } from "./actions";

const choices = [
  ["visits:read", "读取已有足迹与时间轴"],
  ["visits:write", "新增/更新旅行足迹与时间轴"],
  ["destinations:read", "读取未来目的地"],
  ["destinations:write", "导入未来想去"],
  ["media:write", "上传配图（经确认后公开）"],
];

export function TokenCreateForm() {
  const [state, action, pending] = useActionState(issueTokenAction, { token: "", error: "" });
  return <form className="admin-panel admin-form" action={action}>
    <h2>新建 AI / CLI 授权令牌</h2>
    <p className="muted-copy">建议只勾选需要的权限。生成后的完整令牌只显示一次；复制后妥善保存，不要直接发给 AI 聊天模型或写入 Skill 文件。</p>
    <div className="admin-form-grid">
      <label>令牌名称<input name="title" maxLength={80} defaultValue="本地旅行助手" required /></label>
      <label>有效期<select name="days" defaultValue="90"><option value="30">30 天</option><option value="90">90 天</option><option value="365">365 天</option></select></label>
    </div>
    <div className="token-scope-list">
      {choices.map(([id,label]) => <label key={id}><input type="checkbox" name="scopes" value={id} defaultChecked />{label}</label>)}
    </div>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" className="button button-dark" disabled={pending}>{pending ? "生成中…" : "生成授权令牌"}</button>
    {state.token && <div className="token-secret-panel">
      <strong>只显示这一次，请立即复制保存</strong>
      <textarea readOnly rows={3} value={state.token} aria-label="新授权令牌" />
      <button type="button" className="button" onClick={() => navigator.clipboard.writeText(state.token)}>复制令牌</button>
    </div>}
  </form>;
}
