"use client";

import { useActionState } from "react";
import { PreservingForm } from "@/components/preserving-form";
import { acceptPartnerInviteAction, type InviteAcceptState } from "./actions";

const INITIAL: InviteAcceptState = { error: "" };

// 另一半通过一次性邀请链接自助设置账号与密码，无需管理员代设密码。
export function AcceptInviteForm({ token, defaultDisplayName }: { token: string; defaultDisplayName: string }) {
  const [state, action, pending] = useActionState(acceptPartnerInviteAction, INITIAL);
  return (
    <PreservingForm action={action} className="admin-form">
      <input type="hidden" name="token" value={token} />
      <div className="admin-form-grid">
        <label>登录账号<input name="username" type="text" autoCapitalize="none" autoComplete="username" required minLength={3} maxLength={40} placeholder="例如 traveler2" /></label>
        <label>你的显示名称<input name="displayName" type="text" required maxLength={80} defaultValue={defaultDisplayName} placeholder="例如：小周" /></label>
        <label>设置密码（至少 12 位）<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
        <label>确认密码<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "正在加入…" : "创建我的账号并进入编辑室"}</button>
    </PreservingForm>
  );
}
