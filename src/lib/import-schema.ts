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

export const importPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visits"), items: z.array(visitItemSchema).min(1).max(30) }).strict(),
  z.object({ kind: z.literal("destinations"), items: z.array(destinationItemSchema).min(1).max(30) }).strict(),
]);
export type ImportPayload = z.infer<typeof importPayloadSchema>;
