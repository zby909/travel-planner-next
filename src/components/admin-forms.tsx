"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";
import { createFlightAction, saveDestinationAction, savePlaceAction } from "@/app/admin/actions";

const INITIAL: FormState = { error: "" };

function Feedback({ error, pending, submitText }: { error: string; pending: boolean; submitText: string }) {
  return <div className="admin-save-row">{error ? <p role="alert" className="form-error">{error}</p> : null}<button className="button button-dark" type="submit" disabled={pending}>{pending ? "保存中…" : submitText}</button></div>;
}

type DestinationData = {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
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

function Field({ name, label, value, required, type, min, max }: { name: string; label: string; value?: string | number | null; required?: boolean; type?: string; min?: number; max?: number }) {
  return <label>{label}<input name={name} type={type ?? "text"} defaultValue={value ?? ""} required={required} min={min} max={max} /></label>;
}

export function DestinationEditForm({ data }: { data: DestinationData }) {
  const [state, action, pending] = useActionState(saveDestinationAction, INITIAL);
  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="id" value={data.id} />
      <section className="admin-panel">
        <h2>目的地基本资料</h2>
        <div className="admin-form-grid">
          <Field name="title" label="目的地名称" value={data.title} required />
          <Field name="subtitle" label="旅行区域 / 副标题" value={data.subtitle} required />
          <Field name="kind" label="旅行类型" value={data.kind} />
          <Field name="months" label="推荐出行月份" value={data.months} />
          <Field name="days" label="规划天数" value={data.days} />
          <Field name="vibe" label="一句话亮点" value={data.vibe} />
        </div>
        <label>选择这个地方的原因<textarea name="reason" rows={3} defaultValue={data.reason} /></label>
        <label>当地拼团及住宿备注<textarea name="groupText" rows={3} defaultValue={data.groupText} /></label>
      </section>
      <section className="admin-panel">
        <h2>旅行总预算（人民币）</h2>
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

export function FlightCreateForm({ destinations }: { destinations: { id: string; title: string }[] }) {
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
        <Field name="pricePerPerson" label="每人往返价（元）" type="number" min={0} />
        <Field name="totalPrice" label="同行总价（元）" type="number" min={0} />
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

export function PlaceEditForm({ data }: { data: { id: string; name: string; group: string; region: string; whenLabel: string; mapNote: string | null } }) {
  const [state, action, pending] = useActionState(savePlaceAction, INITIAL);
  return (
    <form action={action} className="admin-form admin-panel">
      <input type="hidden" name="id" value={data.id} />
      <div className="admin-form-grid">
        <Field name="name" label="地点名称" value={data.name} required />
        <Field name="region" label="国家 / 省份" value={data.region} required />
        <label>到访归属<select name="group" defaultValue={data.group}><option value="both">我们都去过</option><option value="her">成员 B 到访</option><option value="mine">成员 A 到访</option></select></label>
        <Field name="whenLabel" label="到访日期或生活描述" value={data.whenLabel} />
      </div>
      <label>地图说明<textarea name="mapNote" rows={3} defaultValue={data.mapNote ?? ""} /></label>
      <p className="muted-copy">这里更新地点卡片内容。时间轴事件和行政区坐标暂不在此编辑，以免造成地点关联丢失。</p>
      <Feedback error={state.error} pending={pending} submitText="保存足迹修改" />
    </form>
  );
}
