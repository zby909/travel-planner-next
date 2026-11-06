"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/admin/actions";
import { createDestinationAction, createPlaceAction, saveDestinationAction, savePlaceAction, saveSiteSettingsAction } from "@/app/admin/actions";
import type { GroupLabels, SiteSettings } from "@/lib/site-settings";

const INITIAL: FormState = { error: "" };

function Feedback({ error, pending, submitText }: { error: string; pending: boolean; submitText: string }) {
  return <div className="admin-save-row">{error ? <p role="alert" className="form-error">{error}</p> : null}<button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : submitText}</button></div>;
}

type GuideDayInput = { day: string; title: string; detail: string };

type DestinationData = {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  types: string[];
  seasons: string[];
  months: string;
  days: string;
  vibe: string;
  reason: string;
  groupText: string;
  route: string[];
  spots: string[];
  guide: null | { intro: string; pace: string; stay: string; transport: string; days: GuideDayInput[] };
  minBudget: number;
  maxBudget: number;
  budgetAccommodation: number;
  budgetFood: number;
  budgetTransport: number;
  budgetOther: number;
};

const BUDGET_FIELDS = [
  ["budgetFood", "餐饮"], ["budgetAccommodation", "住宿"],
  ["budgetTransport", "交通"], ["budgetOther", "其它"],
] as const;

function Field({ name, label, value, required, type, min, max, placeholder, step }: { name: string; label: string; value?: string | number | null; required?: boolean; type?: string; min?: number; max?: number; placeholder?: string; step?: string | number }) {
  return <label>{label}<input name={name} type={type ?? "text"} defaultValue={value ?? ""} required={required} min={min} max={max} step={step} placeholder={placeholder} /></label>;
}

// 管理每日攻略的增删与字段编辑。
function GuideDayEditor({ days }: { days: GuideDayInput[] }) {
  const [items, setItems] = useState(days);

  // 更新指定行的攻略内容。
  function updateDay(index: number, key: keyof GuideDayInput, value: string) {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  // 在攻略末尾增加一天。
  function addDay() {
    setItems(current => [...current, { day: `第${current.length + 1}天`, title: "", detail: "" }]);
  }

  // 删除指定的攻略日程。
  function removeDay(index: number) {
    setItems(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section className="guide-day-editor">
      <div className="guide-day-editor-heading"><h3>每日安排</h3><button type="button" className="admin-inline-action" onClick={addDay}>＋ 添加一天</button></div>
      {items.length === 0 ? <p className="muted-copy">还没有每日安排，可以按需要添加。</p> : items.map((item, index) => (
        <div className="guide-day-row" key={index}>
          <label>日期 / 天数<input name="guideDayLabel" value={item.day} onChange={event => updateDay(index, "day", event.target.value)} /></label>
          <label>当天标题<input name="guideDayTitle" value={item.title} onChange={event => updateDay(index, "title", event.target.value)} /></label>
          <label className="guide-day-detail">行程说明<textarea name="guideDayDetail" rows={2} value={item.detail} onChange={event => updateDay(index, "detail", event.target.value)} /></label>
          <button type="button" className="admin-text-action" onClick={() => removeDay(index)}>移除这一天</button>
        </div>
      ))}
    </section>
  );
}

// 编辑目的地资料、路线、攻略和简化后的四类预算。
export function DestinationEditForm({ data, currency }: { data: DestinationData; currency: string }) {
  const [state, action, pending] = useActionState(saveDestinationAction, INITIAL);
  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="id" value={data.id} />
      <section className="admin-panel">
        <h2>目的地基本资料</h2>
        <div className="admin-form-grid">
          <Field name="title" label="目的地名称" value={data.title} required />
          <Field name="subtitle" label="旅行区域 / 副标题" value={data.subtitle} required />
          <Field name="kind" label="主要类型" value={data.kind} />
          <Field name="types" label="筛选分类（逗号分隔）" value={data.types.join("，")} />
          <Field name="seasons" label="适合季节（春、夏、秋、冬）" value={data.seasons.join("，")} />
          <Field name="months" label="推荐出行月份" value={data.months} />
          <Field name="days" label="规划天数" value={data.days} />
          <Field name="vibe" label="一句话亮点" value={data.vibe} />
        </div>
        <label>选择这个地方的原因<textarea name="reason" rows={3} defaultValue={data.reason} /></label>
        <label>当地拼团及住宿备注<textarea name="groupText" rows={3} defaultValue={data.groupText} /></label>
      </section>
      <section className="admin-panel">
        <h2>路线与每日攻略</h2>
        <p className="muted-copy">每行填写一个路线节点或重点景点；每日安排可以自由增删，保存后同步到公开目的地详情。</p>
        <div className="admin-form-grid">
          <label>路线节点（每行一个）<textarea name="routeItems" rows={5} defaultValue={data.route.join("\n")} placeholder="例如：大阪 → 京都\n京都 → 奈良" /></label>
          <label>重点景点（每行一个）<textarea name="spotItems" rows={5} defaultValue={data.spots.join("\n")} placeholder="例如：清水寺\n伏见稻荷大社" /></label>
        </div>
        <label>攻略简介<textarea name="guideIntro" rows={3} defaultValue={data.guide?.intro ?? ""} placeholder="介绍这趟旅行的整体安排" /></label>
        <div className="admin-form-grid">
          <label>节奏建议<textarea name="guidePace" rows={3} defaultValue={data.guide?.pace ?? ""} /></label>
          <label>住宿建议<textarea name="guideStay" rows={3} defaultValue={data.guide?.stay ?? ""} /></label>
          <label>交通建议<textarea name="guideTransport" rows={3} defaultValue={data.guide?.transport ?? ""} /></label>
        </div>
        <GuideDayEditor days={data.guide?.days ?? []} />
      </section>
      <details className="admin-disclosure">
        <summary>预算设置 · {currency}</summary>
        <section className="admin-panel">
          <h2>两人旅行总预算（{currency}）</h2>
          <p className="muted-copy">基准预算由餐饮、住宿、交通和其它四项自动合计；最低与最高预算请手动填写。</p>
          <div className="admin-form-grid">
            <Field name="minBudget" label="预算下限" type="number" value={data.minBudget} min={0} required />
            <Field name="maxBudget" label="预算上限" type="number" value={data.maxBudget} min={0} required />
            {BUDGET_FIELDS.map(([name, label]) => <Field key={name} name={name} label={label} type="number" min={0} value={data[name]} required />)}
          </div>
        </section>
      </details>
      <Feedback error={state.error} pending={pending} submitText="保存目的地修改" />
    </form>
  );
}

// 编辑足迹地点并使用站点配置的成员名称展示归属。
export function PlaceEditForm({ data, groupLabels }: { data: { id: string; name: string; group: string; region: string; whenLabel: string; mapNote: string | null; country: string | null; province: string | null; city: string | null; latitude: number | null; longitude: number | null }; groupLabels: GroupLabels }) {
  const [state, action, pending] = useActionState(savePlaceAction, INITIAL);
  return (
    <form action={action} className="admin-form admin-panel">
      <input type="hidden" name="id" value={data.id} />
      <div className="admin-form-grid">
        <Field name="name" label="地点名称" value={data.name} required />
        <Field name="region" label="国家 / 省份" value={data.region} required />
        <label>到访归属<select name="group" defaultValue={data.group}><option value="both">{groupLabels.both}</option><option value="her">{groupLabels.her}</option><option value="mine">{groupLabels.mine}</option></select></label>
        <Field name="whenLabel" label="到访日期或生活描述" value={data.whenLabel} />
        <Field name="country" label="国家（地图用）" value={data.country} />
        <Field name="province" label="省份 / 州（地图用）" value={data.province} />
        <Field name="city" label="城市（地图用）" value={data.city} />
        <Field name="latitude" label="纬度（可选）" type="number" step="any" value={data.latitude} />
        <Field name="longitude" label="经度（可选）" type="number" step="any" value={data.longitude} />
      </div>
      <label>地图说明<textarea name="mapNote" rows={3} defaultValue={data.mapNote ?? ""} /></label>
      <p className="muted-copy">本页维护地点自身信息与地图坐标；时间轴事件请到「旅行时间轴」单独管理，地点关联不会在这里被改动。</p>
      <Feedback error={state.error} pending={pending} submitText="保存足迹修改" />
    </form>
  );
}

// 新建目的地，详细预算和攻略可以在创建后继续编辑。
export function DestinationCreateForm() {
  const [state, action, pending] = useActionState(createDestinationAction, INITIAL);
  return <form action={action} className="admin-form">
    <section className="admin-panel">
      <h2>目的地基本资料</h2>
      <div className="admin-form-grid">
        <Field name="title" label="目的地名称" required />
        <Field name="subtitle" label="国家 / 地区 / 副标题" required />
        <Field name="flag" label="标识（可选 Emoji）" value="🌍" />
        <Field name="kind" label="主要类型" value="自然" />
        <Field name="types" label="筛选分类（逗号分隔）" value="自然" />
        <Field name="seasons" label="适合季节（春、夏、秋、冬）" placeholder="春，秋" />
        <Field name="months" label="推荐出行月份" placeholder="例如：4—6 月、9—10 月" />
        <Field name="days" label="建议天数" placeholder="例如：5—7 天" />
      </div>
      <label>重点景点（每行一个）<textarea name="spotItems" rows={3} placeholder="例如：清水寺\n伏见稻荷大社" /></label>
      <label>路线节点（每行一个）<textarea name="routeItems" rows={3} placeholder="例如：大阪 → 京都\n京都 → 奈良" /></label>
      <label>一句话亮点<textarea name="vibe" rows={2} /></label>
      <label>目的地介绍<textarea name="reason" rows={4} /></label>
      <p className="muted-copy">新目的地会先使用通用占位封面，预算默认留空。创建后可以继续编辑预算、路线和攻略，也可以通过 AI 导入照片。</p>
    </section>
    <Feedback error={state.error} pending={pending} submitText="创建目的地" />
  </form>;
}

// 新建地点只录入一次文字；照片转到地点详情页分块上传，避免表单超时。
export function PlaceCreateForm({ groupLabels }: { groupLabels: GroupLabels }) {
  const [state, action, pending] = useActionState(createPlaceAction, INITIAL);
  return <form action={action} className="admin-form place-create-form">
    <section className="admin-panel">
      <h2>去过哪里？</h2>
      <div className="admin-form-grid">
        <Field name="name" label="地点名称" required placeholder="例如：京都" />
        <Field name="region" label="国家 / 地区" required placeholder="例如：日本 · 关西" />
        <label>和谁一起<select name="group" defaultValue="both"><option value="both">{groupLabels.both}</option><option value="mine">{groupLabels.mine}</option><option value="her">{groupLabels.her}</option></select></label>
        <Field name="whenLabel" label="到访时间描述（可选）" placeholder="例如：2026 年秋天" />
      </div>
    </section>
    <section className="admin-panel">
      <h2>旅行记录 <span className="muted-copy">· 可选</span></h2>
      <p className="muted-copy">每个地点只有一份文字，随时可继续修改。创建后进入相册逐张上传照片，可以看到上传进度。</p>
      <label>到访日期<input type="date" name="storyDate" /></label>
      <label>想记录的话<textarea name="storyContent" maxLength={20000} rows={5} placeholder="写下关于这个地方的经历和感受……" /></label>
    </section>
    <details className="admin-disclosure">
      <summary>地图坐标与更多信息（可选）</summary>
      <section className="admin-panel">
        <div className="admin-form-grid">
          <Field name="country" label="国家（地图用）" />
          <Field name="province" label="省份 / 州（地图用）" />
          <Field name="city" label="城市（地图用）" />
          <Field name="latitude" label="纬度" type="number" step="any" />
          <Field name="longitude" label="经度" type="number" step="any" />
        </div>
        <label>地图说明<textarea name="mapNote" rows={3} /></label>
      </section>
    </details>
    <Feedback error={state.error} pending={pending} submitText="保存这个去过的地方" />
  </form>;
}

// 管理站点名称、成员显示名和预算默认币种。
export function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, action, pending] = useActionState(saveSiteSettingsAction, INITIAL);
  return <form action={action} className="admin-form">
    <section className="admin-panel">
      <h2>站点品牌</h2>
      <div className="admin-form-grid">
        <Field name="siteName" label="站点名称" value={settings.siteName} required />
        <Field name="siteSubtitle" label="英文副标题" value={settings.siteSubtitle} />
      </div>
    </section>
    <section className="admin-panel">
      <h2>站点访问权限</h2>
      <label>公开方式<select name="visibility" defaultValue={settings.visibility}>
        <option value="PUBLIC">公开展示 · 任何人都可以浏览</option>
        <option value="PRIVATE">仅情侣成员可见 · 需要登录</option>
      </select></label>
      <p className="muted-copy">公开模式适合分享旅行故事；私密模式会同时保护页面和旅行图片。切换为私密前请注意，已经被他人下载或被搜索引擎收录的内容无法撤回。</p>
    </section>
    <section className="admin-panel">
      <h2>你们两个人</h2>
      <p className="muted-copy">用于区分我单独去过、TA 单独去过和我们一起去过；修改名称不会改变已有足迹的归属。</p>
      <div className="admin-form-grid">
        <Field name="primaryMemberName" label="我的显示名称" value={settings.primaryMemberName} required />
        <Field name="secondaryMemberName" label="TA 的显示名称" value={settings.secondaryMemberName} required />
        <Field name="togetherLabel" label="两个人一起去过的名称" value={settings.togetherLabel} required />
      </div>
    </section>
    <section className="admin-panel">
      <h2>默认预算币种</h2>
      <label>币种<select name="currency" defaultValue={settings.currency}>
        {[["CNY", "人民币 CNY"], ["USD", "美元 USD"], ["SGD", "新加坡元 SGD"], ["EUR", "欧元 EUR"], ["GBP", "英镑 GBP"], ["JPY", "日元 JPY"], ["AUD", "澳元 AUD"], ["CAD", "加拿大元 CAD"], ["HKD", "港币 HKD"], ["TWD", "新台币 TWD"], ["KRW", "韩元 KRW"], ["THB", "泰铢 THB"], ["MYR", "马来西亚林吉特 MYR"], ["IDR", "印尼盾 IDR"], ["VND", "越南盾 VND"], ["PHP", "菲律宾比索 PHP"], ["INR", "印度卢比 INR"], ["NZD", "新西兰元 NZD"], ["CHF", "瑞士法郎 CHF"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <p className="muted-copy">更改币种不会自动换算数据库中已有的预算数字。切换币种前，请先确认并按新币种重新核对已有目的地和旅行计划预算。</p>
    </section>
    <Feedback error={state.error} pending={pending} submitText="保存站点设置" />
  </form>;
}
