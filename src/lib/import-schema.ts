import { z } from "zod";

const safeText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const coordinate = z.number().finite();

export const visitItemSchema = z.object({
  name: safeText(100),
  region: safeText(160),
  when: z.string().regex(/^\d{4}(-(?:0[1-9]|1[0-2]))?$/).optional(),
  group: z.enum(["mine", "her", "both"]).default("mine"),
  country: optionalText(80),
  province: optionalText(80),
  city: optionalText(100),
  latitude: coordinate.min(-90).max(90).optional(),
  longitude: coordinate.min(-180).max(180).optional(),
  note: optionalText(600),
  imageId: z.uuid().optional(),
}).strict().refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
  message: "经纬度必须同时填写",
});

export const budgetSchema = z.object({
  flight: z.number().int().min(0).max(1_000_000).default(0),
  hotel: z.number().int().min(0).max(1_000_000).default(0),
  group: z.number().int().min(0).max(1_000_000).default(0),
  food: z.number().int().min(0).max(1_000_000).default(0),
  tickets: z.number().int().min(0).max(1_000_000).default(0),
  transport: z.number().int().min(0).max(1_000_000).default(0),
  other: z.number().int().min(0).max(1_000_000).default(0),
}).strict();

export const destinationItemSchema = z.object({
  title: safeText(100),
  subtitle: safeText(160),
  months: optionalText(100),
  days: optionalText(50),
  vibe: optionalText(220),
  reason: optionalText(2000),
  route: z.array(safeText(200)).max(40).default([]),
  spots: z.array(safeText(120)).max(40).default([]),
  guideDays: z.array(z.object({
    title: safeText(150), detail: safeText(1500),
  }).strict()).max(30).default([]),
  budget: budgetSchema.optional(),
  minBudget: z.number().int().min(0).max(2_000_000).optional(),
  maxBudget: z.number().int().min(0).max(2_000_000).optional(),
  imageId: z.uuid().optional(),
}).strict().superRefine((item, ctx) => {
  const sum = Object.values(item.budget ?? {}).reduce((a, b) => a + b, 0);
  if (item.minBudget !== undefined && item.minBudget > sum && sum !== 0) {
    ctx.addIssue({ code: "custom", message: "预算下限不能超过分项合计" });
  }
  if (item.maxBudget !== undefined && item.maxBudget < sum) {
    ctx.addIssue({ code: "custom", message: "预算上限不能低于分项合计" });
  }
  if (item.minBudget !== undefined && item.maxBudget !== undefined && item.minBudget > item.maxBudget) {
    ctx.addIssue({ code: "custom", message: "预算下限不能超过上限" });
  }
});

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]);
const optionalNullableText = (max: number) => nullableText(max).optional();
const nullableImageId = z.union([z.uuid(), z.null()]).optional();
const visitGroup = z.enum(["mine", "her", "both"]);

export const visitUpdateItemSchema = z.object({
  id: safeText(64),
  name: safeText(100).optional(),
  region: safeText(160).optional(),
  when: z.union([z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/), z.literal("")]).optional(),
  group: visitGroup.optional(),
  country: optionalNullableText(80),
  province: optionalNullableText(80),
  city: optionalNullableText(100),
  latitude: z.union([coordinate.min(-90).max(90), z.null()]).optional(),
  longitude: z.union([coordinate.min(-180).max(180), z.null()]).optional(),
  note: optionalNullableText(600),
  imageId: nullableImageId,
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
}).strict().superRefine((item, ctx) => {
  if (Object.keys(item).length === 1) ctx.addIssue({ code: "custom", message: "至少提供一个需要更新的字段" });
  if ((item.latitude === undefined) !== (item.longitude === undefined)) {
    ctx.addIssue({ code: "custom", message: "经纬度必须同时提供；清除坐标时两者都传 null" });
  }
});

const budgetPatchSchema = z.object({
  flight: z.number().int().min(0).max(1_000_000).optional(),
  hotel: z.number().int().min(0).max(1_000_000).optional(),
  group: z.number().int().min(0).max(1_000_000).optional(),
  food: z.number().int().min(0).max(1_000_000).optional(),
  tickets: z.number().int().min(0).max(1_000_000).optional(),
  transport: z.number().int().min(0).max(1_000_000).optional(),
  other: z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "预算补丁至少需要一个金额字段");

const flightPricingSchema = z.object({
  route: safeText(140),
  normalMin: z.number().int().min(0).max(2_000_000),
  normalMax: z.number().int().min(0).max(2_000_000),
  holidayMin: z.number().int().min(0).max(2_000_000),
  holidayMax: z.number().int().min(0).max(2_000_000),
  normalSample: z.string().trim().max(4000),
  holidaySample: z.string().trim().max(4000),
}).strict().superRefine((value, ctx) => {
  if (value.normalMin > value.normalMax || value.holidayMin > value.holidayMax) {
    ctx.addIssue({ code: "custom", message: "机票价格区间下限不能超过上限" });
  }
});

export const destinationUpdateItemSchema = z.object({
  id: safeText(64),
  title: safeText(100).optional(),
  subtitle: safeText(160).optional(),
  months: optionalText(100),
  days: optionalText(50),
  vibe: optionalText(220),
  reason: optionalText(2000),
  groupText: optionalText(1500),
  flightNote: optionalText(3000),
  flightSource: z.union([z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)), z.null()]).optional(),
  route: z.array(safeText(200)).max(40).optional(),
  spots: z.array(safeText(120)).max(40).optional(),
  budget: budgetPatchSchema.optional(),
  minBudget: z.number().int().min(0).max(2_000_000).optional(),
  maxBudget: z.number().int().min(0).max(2_000_000).optional(),
  flightPricing: z.union([flightPricingSchema, z.null()]).optional(),
  guideDays: z.array(z.object({ title: safeText(150), detail: safeText(1500) }).strict()).max(30).optional(),
  imageId: nullableImageId,
}).strict().refine(item => Object.keys(item).length > 1, "至少提供一个需要更新的字段");

export const timelineItemSchema = z.object({
  id: safeText(64).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  date: z.string().regex(/^\d{4}(?:\.(?:0?[1-9]|1[0-2]))?$/).optional(),
  group: visitGroup.optional(),
  title: safeText(100).optional(),
  note: z.string().trim().max(1200).optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
  placeIds: z.array(safeText(64)).max(100).optional(),
}).strict().superRefine((item, ctx) => {
  if (!item.id && (item.year === undefined || item.date === undefined || !item.group || !item.title)) {
    ctx.addIssue({ code: "custom", message: "新时间轴事件必须提供 year、date、group 和 title" });
  }
  if (item.id && Object.keys(item).length === 1) {
    ctx.addIssue({ code: "custom", message: "至少提供一个需要更新的字段" });
  }
  if (!item.id && !item.placeIds?.length) {
    ctx.addIssue({ code: "custom", message: "新时间轴事件至少需要关联一个足迹地点" });
  }
  if ((item.year === undefined) !== (item.date === undefined)) {
    ctx.addIssue({ code: "custom", message: "year 和 date 必须同时提供" });
  }
  if (item.year !== undefined && item.date !== undefined) {
    const [dateYear, month] = item.date.split(".");
    if (Number(dateYear) !== item.year || (month !== undefined && (Number(month) < 1 || Number(month) > 12))) {
      ctx.addIssue({ code: "custom", message: "时间轴年份与日期不一致" });
    }
  }
  if (item.placeIds && new Set(item.placeIds).size !== item.placeIds.length) {
    ctx.addIssue({ code: "custom", message: "同一事件不能重复关联相同地点" });
  }
});

export const importPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visits"), items: z.array(visitItemSchema).min(1).max(30) }).strict(),
  z.object({ kind: z.literal("destinations"), items: z.array(destinationItemSchema).min(1).max(30) }).strict(),
  z.object({ kind: z.literal("visits-update"), items: z.array(visitUpdateItemSchema).min(1).max(30) }).strict(),
  z.object({ kind: z.literal("destinations-update"), items: z.array(destinationUpdateItemSchema).min(1).max(30) }).strict(),
  z.object({ kind: z.literal("timeline"), items: z.array(timelineItemSchema).min(1).max(30) }).strict(),
]);
export type ImportPayload = z.infer<typeof importPayloadSchema>;
