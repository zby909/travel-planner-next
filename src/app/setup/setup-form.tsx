"use client";

import { useActionState } from "react";
import { PreservingForm } from "@/components/preserving-form";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/money";
import { completeInitialSetupAction, type SetupState } from "./actions";

const INITIAL: SetupState = { error: "" };

// 首次部署引导表单：一步设置空间信息、隐私模式与管理员账号，免去命令行建号。
export function SetupForm() {
  const [state, action, pending] = useActionState(completeInitialSetupAction, INITIAL);
  return (
    <PreservingForm action={action} className="admin-form">
      <div className="admin-form-grid">
        <label>空间名称<input name="siteName" required maxLength={40} defaultValue="我们的旅行手记" placeholder="例如：下一站 / 小林与小周的地图" /></label>
        <label>默认币种<select name="currency" defaultValue="CNY">{SUPPORTED_CURRENCY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
        <label>你的昵称<input name="primaryMemberName" required maxLength={30} defaultValue="我" placeholder="例如：小林" /></label>
        <label>另一半昵称<input name="secondaryMemberName" required maxLength={30} defaultValue="TA" placeholder="例如：小周" /></label>
      </div>
      <label>空间隐私模式
        <select name="visibility" defaultValue="PRIVATE">
          <option value="PRIVATE">仅我们两个人可见 · 需要登录（推荐）</option>
          <option value="PUBLIC">公开展示 · 可直接分享给亲友浏览</option>
        </select>
        <small>随时可以在后台的「站点设置」中切换。</small>
      </label>
      <div className="admin-form-grid">
        <label>管理员登录账号<input name="username" type="text" autoCapitalize="none" autoComplete="username" required minLength={3} maxLength={40} placeholder="例如 owner" /></label>
        <label>登录密码（至少 12 位）<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
        <label>确认密码<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "正在布置空间…" : "完成布置，进入编辑室"}</button>
    </PreservingForm>
  );
}
