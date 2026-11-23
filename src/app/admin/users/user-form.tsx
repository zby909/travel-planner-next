"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { PreservingForm } from "@/components/preserving-form";
import {
  createAccountAction,
  createPartnerInviteAction,
  revokePartnerInviteAction,
  type PartnerInviteState,
} from "./actions";
import type { FormState } from "@/app/admin/actions";

const subscribeOrigin = () => () => {};
const INITIAL_INVITE: PartnerInviteState = { error: "", token: "", expiresAt: "" };

// 推荐方式：生成 24 小时一次性邀请链接，让另一半自己设置登录账号与密码。
export function PartnerInvitePanel({
  defaultSuggestedName,
  existingInvite,
}: {
  defaultSuggestedName: string;
  existingInvite: { active: false } | { active: true; expiresAt: string; suggestedName: string };
}) {
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "");
  const [state, action, pending] = useActionState(createPartnerInviteAction, INITIAL_INVITE);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const inviteUrl = state.token ? `${origin}/invite/${state.token}` : "";

  // 一键复制伴侣邀请链接，权限受限时提示手动复制。
  async function copyInvite() {
    if (!inviteUrl) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("浏览器未能写入剪贴板，请直接选中上方链接复制发给对方。");
    }
  }

  return (
    <section className="admin-panel admin-form">
      <h2>邀请另一半加入（推荐）</h2>
      <p className="muted-copy">生成一条 24 小时内有效的一次性链接发给对方，对方点开即可自行设置账号与密码，无需你代设密码。</p>
      {existingInvite.active && !state.token ? (
        <div className="restore-status" role="status">
          <strong>当前已有一条待使用的邀请链接</strong>
          <p>有效期至 {new Date(existingInvite.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。出于安全原因不会再次显示旧链接；若忘记或需要更换，可重新生成覆盖或先撤销。</p>
        </div>
      ) : null}
      <PreservingForm action={action} className="admin-form">
        <div className="admin-form-grid">
          <label>为对方预设显示昵称（可选）<input name="suggestedName" type="text" maxLength={80} defaultValue={existingInvite.active ? existingInvite.suggestedName : defaultSuggestedName} placeholder="例如：小周" /></label>
        </div>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <div className="admin-save-row">
          <button className="button button-dark" type="submit" disabled={pending}>
            {pending ? "生成中…" : existingInvite.active || state.token ? "重新生成邀请链接" : "生成 24 小时邀请链接"}
          </button>
        </div>
      </PreservingForm>
      {state.token ? (
        <div className="token-secret-panel">
          <strong>请复制发给另一半（仅本次显示，使用一次后自动失效）</strong>
          <textarea readOnly rows={2} value={inviteUrl} aria-label="伴侣一次性邀请链接" />
          <div className="admin-save-row">
            <button type="button" className="button button-dark" onClick={() => { void copyInvite(); }}>{copied ? "已复制邀请链接" : "复制邀请链接"}</button>
          </div>
          {copyError ? <p className="form-error" role="alert">{copyError}</p> : null}
        </div>
      ) : null}
      {existingInvite.active || state.token ? (
        <form action={revokePartnerInviteAction} onSubmit={event => { if (!window.confirm("确定撤销当前未使用的邀请链接吗？")) event.preventDefault(); }}>
          <button type="submit" className="admin-text-action">撤销当前邀请链接</button>
        </form>
      ) : null}
    </section>
  );
}

// 为第二位私人维护者提供独立密码和编辑权限的手动账号创建表单。
export function AccountCreateForm() {
  const [state, action, pending] = useActionState(createAccountAction, { error: "" } satisfies FormState);
  return <PreservingForm action={action} className="admin-panel admin-form">
    <h2>或者直接为其创建账号</h2>
    <p className="muted-copy">如果你们就在彼此身边，也可以直接在这里设置第二个账号；新账号默认拥有旅行内容编辑权限，不包含系统管理权限。</p>
    <div className="admin-form-grid">
      <label>用户名<input name="username" type="text" autoComplete="off" required minLength={3} maxLength={40} placeholder="例如 traveler2" /></label>
      <label>显示名称<input name="displayName" type="text" required maxLength={80} placeholder="例如 旅行伙伴" /></label>
      <label>初始密码<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      <label>确认密码<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
    </div>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <button className="button button-dark" type="submit" disabled={pending}>{pending ? "创建中…" : "创建编辑账号"}</button>
  </PreservingForm>;
}
