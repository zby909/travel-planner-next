"use client";

import { useActionState } from "react";
import { createAccountAction } from "./actions";
import type { FormState } from "@/app/admin/actions";

export function AccountCreateForm() {
  const [state, action, pending] = useActionState(createAccountAction, { error: "" } satisfies FormState);
  return <form action={action} className="admin-panel admin-form">
    <h2>新增私人编辑账号</h2>
    <p className="muted-copy">新用户默认具有编辑权限，但不能创建其他账号。请不要将密码发送到聊天或写入配置文件。</p>
    <div className="admin-form-grid">
      <label>用户名<input name="username" type="text" autoComplete="off" required minLength={3} maxLength={40} placeholder="例如 wangying" /></label>
      <label>显示名称<input name="displayName" type="text" required maxLength={80} placeholder="例如 王颖" /></label>
      <label>初始密码<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      <label>确认密码<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
    </div>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <button className="button button-dark" type="submit" disabled={pending}>{pending ? "创建中…" : "创建编辑账号"}</button>
  </form>;
}
