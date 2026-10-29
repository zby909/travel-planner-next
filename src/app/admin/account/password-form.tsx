"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "" });
  return (
    <form action={action} className="admin-panel admin-form">
      <h2>修改登录密码</h2>
      <p className="muted-copy">请使用独立的高强度密码。修改成功后会注销你所有设备上的登录会话，需要重新登录。</p>
      <label>当前密码<input type="password" name="currentPassword" autoComplete="current-password" required /></label>
      <label>新密码<input type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <label>确认新密码<input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="button button-dark">{pending ? "修改中…" : "更新密码并退出所有设备"}</button>
    </form>
  );
}
