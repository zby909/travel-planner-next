"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";
import { createDestinationAction, createFlightAction, createPlaceAction, saveDestinationAction, savePlaceAction, saveSiteSettingsAction } from "@/app/admin/actions";
import type { GroupLabels, SiteSettings } from "@/lib/site-settings";

const INITIAL: FormState = { error: "" };

function Feedback({ error, pending, submitText }: { error: string; pending: boolean; submitText: string }) {
  return <div className="admin-save-row">{error ? <p role="alert" className="form-error">{error}</p> : null}<button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : submitText}</button></div>;
}

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
  flightNote: string;
  flightSource: string | null;
  minBudget: number;
  maxBudget: number;
  budgetFlight: number;
  budgetHotel: number;
  budgetGroup: number;
  budgetFood: number;
  budgetTickets: number;
  budgetTransport: number;
  budgetOther: number;
  flightPricing: null | {
    route: string; normalMin: number; normalMax: number; holidayMin: number; holidayMax: number;
    normalSample: string; holidaySample: string;
  };
};

const BUDGET_FIELDS = [
  ["budgetFlight", "往返机票"], ["budgetHotel", "住宿"], ["budgetGroup", "当地团费"],
  ["budgetFood", "餐饮"], ["budgetTickets", "门票与体验"], ["budgetTransport", "交通"], ["budgetOther", "其他"],
] as const;

function Field({ name, label, value, required, type, min, max, placeholder, step }: { name: string; label: string; value?: string | number | null; required?: boolean; type?: string; min?: number; max?: number; placeholder?: string; step?: string | number }) {
  return <label>{label}<input name={name} type={type ?? "text"} defaultValue={value ?? ""} required={required} min={min} max={max} step={step} placeholder={placeholder} /></label>;
}

// 编辑目的地基础资料、筛选标签、预算和机票参考。
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
        <h2>两人旅行总预算（{currency}）</h2>
        <p className="muted-copy">基准预算由下方七项自动合计，避免数字不一致；最低与最高预算请手动填写。</p>
        <div className="admin-form-grid">
          <Field name="minBudget" label="预算下限" type="number" value={data.minBudget} min={0} required />
          <Field name="maxBudget" label="预算上限" type="number" value={data.maxBudget} min={0} required />
          {BUDGET_FIELDS.map(([name, label]) => <Field key={name} name={name} label={label} type="number" min={0} value={data[name]} required />)}
        </div>
      </section>
      <section className="admin-panel">
        <h2>机票规划依据</h2>
        <div className="admin-form-grid">
          <Field name="route" label="往返航线（可选）" value={data.flightPricing?.route ?? ""} />
          <Field name="flightSource" label="参考来源链接" value={data.flightSource} type="url" />
          {([
            ["normalMin", "平日最低"], ["normalMax", "平日最高"], ["holidayMin", "节假日最低"], ["holidayMax", "节假日最高"],
          ] as const).map(([name, label]) => <Field key={name} name={name} label={label} type="number" min={0} value={data.flightPricing?.[name] ?? 0} required />)}
        </div>
        <label>普通日期报价依据<textarea name="normalSample" rows={3} defaultValue={data.flightPricing?.normalSample} /></label>
        <label>节假日报价依据<textarea name="holidaySample" rows={3} defaultValue={data.flightPricing?.holidaySample} /></label>
        <label>机票注意事项<textarea name="flightNote" rows={3} defaultValue={data.flightNote} /></label>
      </section>
      <Feedback error={state.error} pending={pending} submitText="保存目的地修改" />
    </form>
  );
}

// 新增机票价格样本，并明确标注所使用的币种。
export function FlightCreateForm({ destinations, currency }: { destinations: { id: string; title: string }[]; currency: string }) {
  const [state, action, pending] = useActionState(createFlightAction, INITIAL);
  return (
    <form action={action} className="admin-form admin-panel">
      <h2>新增机票价格记录</h2>
      <p className="muted-copy">实际查询和估算必须分开标注；不知道的航司、行李和日期可以留空，不能猜测。</p>
      <div className="admin-form-grid">
        <label>关联目的地<select name="destinationId" defaultValue=""><option value="">暂不关联</option>{destinations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <label>证据类型<select name="sourceType" defaultValue="USER_REPORTED"><option value="USER_REPORTED">用户实际查询</option><option value="PUBLIC_REFERENCE">公开价格参考</option><option value="HISTORICAL">历史价格样本</option><option value="PLANNING_ESTIMATE">规划估算（非报价）</option></select></label>
        <Field name="route" label="航线描述" required />
        <Field name="origin" label="出发城市" required />
        <Field name="destinationName" label="到达城市" required />
        <Field name="sourceName" label="平台 / 数据来源" />
        <Field name="departureDate" label="去程日期" type="date" />
        <Field name="returnDate" label="返程日期" type="date" />
        <Field name="pricePerPerson" label={`每人往返价（${currency}）`} type="number" min={0} />
        <Field name="totalPrice" label={`两人往返总价（${currency}）`} type="number" min={0} />
        <Field name="checkedAt" label="查询日期" type="date" />
        <Field name="airline" label="航司（未知可空）" />
        <label>航班类型<select name="flightType" defaultValue=""><option value="">未确认</option><option value="DIRECT">直飞</option><option value="TRANSFER">中转</option></select></label>
        <label>是否含托运行李<select name="baggageIncluded" defaultValue="unknown"><option value="unknown">尚未确认</option><option value="yes">包含</option><option value="no">不包含</option></select></label>
        <Field name="baggageDetails" label="托运行李说明" />
        <Field name="sourceUrl" label="来源链接" type="url" />
      </div>
      <label>查询条件、备注和价格限制<textarea name="notes" rows={3} /></label>
      <Feedback error={state.error} pending={pending} submitText="保存机票样本" />
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
      <p className="muted-copy">这里更新地点卡片内容。时间轴事件和行政区坐标暂不在此编辑，以免造成地点关联丢失。</p>
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
        <Field name="spots" label="重点景点（逗号分隔）" />
      </div>
      <label>一句话亮点<textarea name="vibe" rows={2} /></label>
      <label>目的地介绍<textarea name="reason" rows={4} /></label>
      <p className="muted-copy">新目的地会先使用通用占位封面，预算默认留空。创建后可以继续编辑预算、机票、路线和攻略，也可以通过 AI 导入照片。</p>
    </section>
    <Feedback error={state.error} pending={pending} submitText="创建目的地" />
  </form>;
}

// 新建足迹地点，坐标为可选项；补齐后会自动出现在地图上。
export function PlaceCreateForm({ groupLabels }: { groupLabels: GroupLabels }) {
  const [state, action, pending] = useActionState(createPlaceAction, INITIAL);
  return <form action={action} className="admin-form admin-panel">
    <div className="admin-form-grid">
      <Field name="name" label="地点名称" required />
      <Field name="region" label="国家 / 省份 / 地区" required />
      <label>到访归属<select name="group" defaultValue="mine"><option value="mine">{groupLabels.mine}</option><option value="her">{groupLabels.her}</option><option value="both">{groupLabels.both}</option></select></label>
      <Field name="whenLabel" label="到访日期或时间描述" />
      <Field name="country" label="国家（地图用）" />
      <Field name="province" label="省份 / 州（地图用）" />
      <Field name="city" label="城市（地图用）" />
      <Field name="latitude" label="纬度（可选）" type="number" step="any" />
      <Field name="longitude" label="经度（可选）" type="number" step="any" />
    </div>
    <label>地点备注<textarea name="mapNote" rows={3} /></label>
    <p className="muted-copy">不填写坐标也可以保存；封面照片可以之后通过 AI 图片导入补充。</p>
    <Feedback error={state.error} pending={pending} submitText="新增足迹地点" />
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
      <p className="muted-copy">更改币种不会自动换算数据库中已有的预算数字。切换币种前，请先确认并按新币种重新核对已有目的地预算；机票样本会保留各自记录的币种。</p>
    </section>
    <Feedback error={state.error} pending={pending} submitText="保存站点设置" />
  </form>;
}
