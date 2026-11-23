"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/admin/actions";
import { createDestinationAction, createPlaceAction, saveDestinationAction, savePlaceAction, saveSiteSettingsAction } from "@/app/admin/actions";
import { GeoLocationPicker, type GeoValues } from "@/components/geo-location-picker";
import { PreservingForm } from "@/components/preserving-form";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/money";
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
  flag: string;
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
      <div className="guide-day-editor-heading"><h3>每日安排</h3><button type="button" className="admin-inline-action" disabled={items.length >= 30} onClick={addDay}>＋ 添加一天</button></div>
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

// 编辑目的地资料；路线、每日攻略和预算按需展开，保持日常编辑轻盈清晰。
export function DestinationEditForm({ data, currency }: { data: DestinationData; currency: string }) {
  const [state, action, pending] = useActionState(saveDestinationAction, INITIAL);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const hasPlanningDetails = Boolean(data.route.length || data.spots.length || data.guide);
  return (
    <PreservingForm action={action} className="admin-form">
      <input type="hidden" name="id" value={data.id} />
      <section className="admin-panel">
        <h2>目的地基本资料</h2>
        <div className="admin-form-grid">
          <Field name="title" label="目的地名称" value={data.title} required />
          <Field name="subtitle" label="所在地区 / 副标题" value={data.subtitle} required />
          <Field name="seasons" label="适合季节（春、夏、秋、冬）" value={data.seasons.join("，")} />
          <Field name="months" label="推荐出行月份" value={data.months} />
          <Field name="days" label="建议天数" value={data.days} />
          <Field name="vibe" label="一句话亮点" value={data.vibe} />
        </div>
        <label>为什么想去这里<textarea name="reason" rows={3} defaultValue={data.reason} /></label>
      </section>
      <details className="admin-disclosure" open={hasPlanningDetails}>
        <summary>标签、路线与每日攻略（可选）</summary>
        <section className="admin-panel">
          <div className="admin-form-grid">
            <Field name="flag" label="标识（可选 Emoji）" value={data.flag} />
            <Field name="kind" label="主要类型" value={data.kind} />
            <Field name="types" label="筛选分类（逗号分隔）" value={data.types.join("，")} />
          </div>
          <p className="muted-copy">每行填写一个路线节点或重点景点；每日安排可按需增删，不需要全部填满。</p>
          <div className="admin-form-grid">
            <label>路线节点（每行一个）<textarea name="routeItems" rows={4} defaultValue={data.route.join("\n")} placeholder={"例如：大阪 → 京都\n京都 → 奈良"} /></label>
            <label>重点景点（每行一个）<textarea name="spotItems" rows={4} defaultValue={data.spots.join("\n")} placeholder={"例如：清水寺\n伏见稻荷大社"} /></label>
          </div>
          <label>攻略简介<textarea name="guideIntro" rows={3} defaultValue={data.guide?.intro ?? ""} placeholder="介绍这趟旅行的整体安排" /></label>
          <div className="admin-form-grid">
            <label>节奏建议<textarea name="guidePace" rows={2} defaultValue={data.guide?.pace ?? ""} /></label>
            <label>住宿建议<textarea name="guideStay" rows={2} defaultValue={data.guide?.stay ?? ""} /></label>
            <label>交通建议<textarea name="guideTransport" rows={2} defaultValue={data.guide?.transport ?? ""} /></label>
          </div>
          <GuideDayEditor days={data.guide?.days ?? []} />
          <label>内部备注（仅后台可见）<textarea name="groupText" rows={2} defaultValue={data.groupText} /></label>
        </section>
      </details>
      <details className="admin-disclosure">
        <summary>预算设置 · {selectedCurrency}</summary>
        <section className="admin-panel">
          <h2>两人旅行总预算（{selectedCurrency}）</h2>
          <p className="muted-copy">基准预算由餐饮、住宿、交通和其它四项自动合计；最低与最高预算请手动填写。</p>
          <div className="admin-form-grid">
            <label>预算币种<select name="currency" value={selectedCurrency} onChange={event => setSelectedCurrency(event.target.value)}>{SUPPORTED_CURRENCY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
            <Field name="minBudget" label="预算下限" type="number" value={data.minBudget} min={0} required />
            <Field name="maxBudget" label="预算上限" type="number" value={data.maxBudget} min={0} required />
            {BUDGET_FIELDS.map(([name, label]) => <Field key={name} name={name} label={label} type="number" min={0} value={data[name]} required />)}
          </div>
        </section>
      </details>
      <Feedback error={state.error} pending={pending} submitText="保存目的地修改" />
    </PreservingForm>
  );
}

// 编辑地点地理信息；支持离线地理联想一键填充坐标与地图标准区划名。
export function PlaceEditForm({ data }: { data: { id: string; name: string; region: string; mapNote: string | null; country: string | null; province: string | null; city: string | null; latitude: number | null; longitude: number | null } }) {
  const [state, action, pending] = useActionState(savePlaceAction, INITIAL);
  const [geo, setGeo] = useState<GeoValues>({
    country: data.country ?? "",
    province: data.province ?? "",
    city: data.city ?? "",
    latitude: data.latitude !== null ? String(data.latitude) : "",
    longitude: data.longitude !== null ? String(data.longitude) : "",
  });
  return (
    <PreservingForm action={action} className="admin-form admin-panel">
      <input type="hidden" name="id" value={data.id} />
      <div className="admin-form-grid">
        <Field name="name" label="地点名称" value={data.name} required />
        <Field name="region" label="国家 / 省份" value={data.region} required />
      </div>
      <GeoLocationPicker value={geo} onChange={setGeo} />
      <div className="admin-form-grid">
        <label>国家（地图用）<input name="country" value={geo.country} onChange={event => setGeo(prev => ({ ...prev, country: event.target.value }))} /></label>
        <label>省份 / 州（地图用）<input name="province" value={geo.province} onChange={event => setGeo(prev => ({ ...prev, province: event.target.value }))} /></label>
        <label>城市（地图用）<input name="city" value={geo.city} onChange={event => setGeo(prev => ({ ...prev, city: event.target.value }))} /></label>
        <label>纬度（可选）<input name="latitude" type="number" step="any" value={geo.latitude} onChange={event => setGeo(prev => ({ ...prev, latitude: event.target.value }))} /></label>
        <label>经度（可选）<input name="longitude" type="number" step="any" value={geo.longitude} onChange={event => setGeo(prev => ({ ...prev, longitude: event.target.value }))} /></label>
      </div>
      <label>地图说明<textarea name="mapNote" rows={3} defaultValue={data.mapNote ?? ""} /></label>
      <Feedback error={state.error} pending={pending} submitText="保存足迹修改" />
    </PreservingForm>
  );
}

// 轻量收藏想去的目的地：只需填写名称、地区与心动理由，其余规划项按需展开。
export function DestinationCreateForm() {
  const [state, action, pending] = useActionState(createDestinationAction, INITIAL);
  return <PreservingForm action={action} className="admin-form destination-create-form">
    <section className="admin-panel">
      <h2>想去哪里？</h2>
      <div className="admin-form-grid">
        <Field name="title" label="目的地名称" required placeholder="例如：京都" />
        <Field name="subtitle" label="国家 / 地区" required placeholder="例如：日本 · 关西" />
        <Field name="seasons" label="适合季节（春、夏、秋、冬）" placeholder="春，秋" />
        <Field name="months" label="推荐出行月份（可选）" placeholder="例如：4—6 月、9—10 月" />
        <Field name="days" label="建议天数（可选）" placeholder="例如：5—7 天" />
        <Field name="vibe" label="一句话亮点（可选）" placeholder="例如：红叶寺庙与鸭川傍晚散步" />
      </div>
      <label>为什么想去这里（可选）<textarea name="reason" rows={3} placeholder="写下吸引你们的风景、美食或一起想做的事" /></label>
      <p className="muted-copy">保存后可随时上传喜欢的封面照片，或补充预算与行程安排。</p>
    </section>
    <details className="admin-disclosure">
      <summary>更多规划信息（可选：分类标签、路线与重点景点）</summary>
      <section className="admin-panel">
        <div className="admin-form-grid">
          <Field name="flag" label="标识（可选 Emoji）" value="🌍" />
          <Field name="kind" label="主要类型" value="自然" />
          <Field name="types" label="筛选分类（逗号分隔）" value="自然" />
        </div>
        <label>重点景点（每行一个）<textarea name="spotItems" rows={3} placeholder={"例如：清水寺\n伏见稻荷大社"} /></label>
        <label>路线节点（每行一个）<textarea name="routeItems" rows={3} placeholder={"例如：大阪 → 京都\n京都 → 奈良"} /></label>
      </section>
    </details>
    <Feedback error={state.error} pending={pending} submitText="创建目的地" />
  </PreservingForm>;
}

// 新建地点时记录首次到访，并通过离线地理搜索一键填充坐标，保存后即可上传照片。
export function PlaceCreateForm({ groupLabels }: { groupLabels: GroupLabels }) {
  const [state, action, pending] = useActionState(createPlaceAction, INITIAL);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [geo, setGeo] = useState<GeoValues>({ country: "", province: "", city: "", latitude: "", longitude: "" });
  return <PreservingForm action={action} className="admin-form place-create-form">
    <section className="admin-panel">
      <h2>去过哪里？</h2>
      <div className="admin-form-grid">
        <label>地点名称<input name="name" required value={name} onChange={event => setName(event.target.value)} placeholder="例如：京都" /></label>
        <label>国家 / 地区<input name="region" required value={region} onChange={event => setRegion(event.target.value)} placeholder="例如：日本 · 关西" /></label>
      </div>
      <GeoLocationPicker
        value={geo}
        onChange={setGeo}
        onPickPreset={preset => {
          if (!name.trim()) setName(preset.label);
          if (!region.trim()) setRegion(preset.region);
        }}
      />
    </section>
    <section className="admin-panel">
      <h2>首次到访</h2>
      <div className="admin-form-grid">
        <label>同行人<select name="group" defaultValue="both"><option value="both">{groupLabels.both}</option><option value="mine">{groupLabels.mine}</option><option value="her">{groupLabels.her}</option><option value="">待补充</option></select></label>
        <label>到访日期<input type="date" name="happenedAt" /></label>
        <Field name="whenLabel" label="日期说明（可选）" placeholder="例如：2026 年秋天" />
      </div>
      <label>手记<textarea name="content" maxLength={20000} rows={5} placeholder="写下这次旅行最想记住的事" /></label>
    </section>
    <details className="admin-disclosure">
      <summary>精确坐标与地图说明（可选，支持手动微调）</summary>
      <section className="admin-panel">
        <div className="admin-form-grid">
          <label>国家（地图用）<input name="country" value={geo.country} onChange={event => setGeo(prev => ({ ...prev, country: event.target.value }))} /></label>
          <label>省份 / 州（地图用）<input name="province" value={geo.province} onChange={event => setGeo(prev => ({ ...prev, province: event.target.value }))} /></label>
          <label>城市（地图用）<input name="city" value={geo.city} onChange={event => setGeo(prev => ({ ...prev, city: event.target.value }))} /></label>
          <label>纬度<input name="latitude" type="number" step="any" value={geo.latitude} onChange={event => setGeo(prev => ({ ...prev, latitude: event.target.value }))} /></label>
          <label>经度<input name="longitude" type="number" step="any" value={geo.longitude} onChange={event => setGeo(prev => ({ ...prev, longitude: event.target.value }))} /></label>
        </div>
        <label>地图说明<textarea name="mapNote" rows={3} /></label>
      </section>
    </details>
    <Feedback error={state.error} pending={pending} submitText="保存这个去过的地方" />
  </PreservingForm>;
}

// 管理站点名称、成员显示名和预算默认币种。
export function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, action, pending] = useActionState(saveSiteSettingsAction, INITIAL);
  return <PreservingForm action={action} className="admin-form">
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
      <h2>每个地点的相册容量</h2>
      <div className="admin-form-grid">
        <Field name="albumMaxPhotos" label="照片数量上限" type="number" min={1} max={500} value={settings.albumMaxPhotos} required />
        <Field name="albumMaxMiB" label="压缩后总大小（MiB）" type="number" min={1} max={256} value={settings.albumMaxMiB} required />
      </div>
      <p className="muted-copy">同一地点的历次到访和回收站照片共同计入容量。调整上限后，已有照片仍可浏览。</p>
    </section>
    <section className="admin-panel">
      <h2>默认预算币种</h2>
      <label>币种<select name="currency" defaultValue={settings.currency}>
        {SUPPORTED_CURRENCY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select></label>
      <p className="muted-copy">用于新建的目的地和旅行计划。已有预算沿用记录时的币种。</p>
    </section>
    <Feedback error={state.error} pending={pending} submitText="保存站点设置" />
  </PreservingForm>;
}
