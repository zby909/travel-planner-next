"use client";

import { useActionState } from "react";
import {
  createTravelPlanAction,
  saveTravelPlanAction,
  saveTravelGuideLinkAction,
  type PlanFormState,
} from "./actions";

const INITIAL_STATE: PlanFormState = { error: "" };
const CURRENCIES = ["CNY", "SGD", "JPY", "USD", "EUR", "GBP", "AUD", "CAD", "HKD", "TWD", "KRW", "THB", "MYR", "IDR", "VND", "PHP", "INR", "NZD", "CHF"] as const;

type DestinationOption = { id: string; title: string };
type PlanInput = {
  id: string;
  title: string;
  destinationId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  plannedBudget: number | null;
  currency: string;
  currencyLocked: boolean;
  notes: string;
};
type GuideInput = {
  id: string;
  title: string;
  url: string;
  dayDate: string;
  coverImage: string;
  description: string;
  sortOrder: number;
};

// 编辑或创建一趟旅行的基础信息。
export function TravelPlanForm({ destinations, currency, initial }: {
  destinations: DestinationOption[];
  currency: string;
  initial?: PlanInput;
}) {
  const formAction = initial ? saveTravelPlanAction : createTravelPlanAction;
  const [state, action, pending] = useActionState(formAction, INITIAL_STATE);
  return <form action={action} className="admin-form">
    {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
    <section className="admin-panel">
      <h2>旅行基本信息</h2>
      <div className="admin-form-grid">
        <label>旅行名称<input name="title" required maxLength={100} defaultValue={initial?.title ?? ""} placeholder="例如：日本关西慢旅行" /></label>
        <label>关联心愿目的地<select name="destinationId" defaultValue={initial?.destinationId ?? ""}><option value="">暂不关联</option>{destinations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>出发日期<input name="startDate" type="date" defaultValue={initial?.startDate ?? ""} /></label>
        <label>结束日期<input name="endDate" type="date" defaultValue={initial?.endDate ?? ""} /></label>
        <label>旅行状态<select name="status" defaultValue={initial?.status ?? "PLANNED"}><option value="PLANNED">计划中</option><option value="BOOKED">已预订</option><option value="COMPLETED">已完成</option><option value="CANCELLED">已取消</option></select></label>
        <label>计划预算<input name="plannedBudget" type="number" min={0} max={100000000} step={1} defaultValue={initial?.plannedBudget ?? ""} placeholder="可留空" /></label>
        <label>预算币种
         {initial?.currencyLocked ? <>
           <input type="hidden" name="currency" value={initial.currency} />
           <input value={initial.currency} disabled readOnly aria-label="已锁定的预算币种" />
           <small>已有费用记录，币种已锁定，避免历史金额被错误换算。</small>
         </> : <select name="currency" defaultValue={initial?.currency ?? currency}>{CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</select>}
       </label>
      </div>
      <label>旅行备注<textarea name="notes" rows={4} maxLength={4000} defaultValue={initial?.notes ?? ""} placeholder="机票、住宿、同行安排或出发前需要记住的事情" /></label>
    </section>
    <div className="admin-save-row">
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : initial ? "保存旅行计划" : "创建旅行计划"}</button>
    </div>
  </form>;
}

// 管理一份部署在 Stack-Nest 等外部平台的 HTML 旅行攻略入口。
export function TravelGuideLinkForm({ planId, initial }: { planId: string; initial?: GuideInput }) {
  const [state, action, pending] = useActionState(saveTravelGuideLinkAction, INITIAL_STATE);
  return <form action={action} className="admin-form plan-guide-form">
    <input type="hidden" name="planId" value={planId} />
    <input type="hidden" name="id" value={initial?.id ?? ""} />
    <div className="admin-form-grid">
      <label>攻略名称<input name="title" required maxLength={120} defaultValue={initial?.title ?? ""} placeholder="例如：日本七日漫游手册" /></label>
      <label>关联日期<input name="dayDate" type="date" defaultValue={initial?.dayDate ?? ""} /><small>留空表示整趟旅行；填写日期表示当天攻略。</small></label>
      <label className="plan-guide-url">部署后的访问地址<input name="url" required maxLength={1000} inputMode="url" defaultValue={initial?.url ?? ""} placeholder="https://your-guide.example.com/" /><small>直接填写 Stack-Nest CLI 部署完成后的 URL，不需要上传 HTML。</small></label>
      <label>封面图片地址（可选）<input name="coverImage" maxLength={1000} inputMode="url" defaultValue={initial?.coverImage ?? ""} placeholder="https://..." /></label>
      <label>显示顺序<input name="sortOrder" type="number" min={0} max={10000} step={1} defaultValue={initial?.sortOrder ?? ""} placeholder="留空自动追加" /></label>
    </div>
    <label>攻略简介（可选）<textarea name="description" rows={2} maxLength={600} defaultValue={initial?.description ?? ""} placeholder="简单介绍这份攻略的内容或设计特色" /></label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="admin-save-row"><button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : initial ? "保存攻略入口" : "添加攻略入口"}</button></div>
  </form>;
}

// 删除计划前说明关联数据的处理方式并要求再次确认。
export function DeleteTravelPlanButton() {
  return <button className="admin-danger" type="submit" onClick={event => {
    if (!window.confirm("确定删除这趟旅行计划吗？其攻略入口、费用、旅行日记和照片也会一并删除；Stack-Nest 上的 HTML 页面不会被删除。")) event.preventDefault();
  }}>删除旅行计划</button>;
}

// 删除攻略入口前确认只移除本地链接，不会删除外部部署内容。
export function DeleteTravelGuideButton() {
  return <button className="admin-text-action" type="submit" onClick={event => {
    if (!window.confirm("确定移除这条攻略入口吗？Stack-Nest 上的原始页面不会受到影响。")) event.preventDefault();
  }}>移除入口</button>;
}
