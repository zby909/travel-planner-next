import type { Prisma } from "@prisma/client";
import { formatDate } from "@/lib/format";

export const VISIT_GROUPS = ["both", "mine", "her"] as const;
export type VisitGroup = (typeof VISIT_GROUPS)[number];
export type VisitGroupLabels = Record<VisitGroup, string>;

export const visitDateSelect = { id: true, group: true, whenLabel: true, happenedAt: true, createdAt: true } as const;
export const visitPhotoOrder: Prisma.TravelPhotoOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }];

type VisitDate = { happenedAt: Date | null; whenLabel: string };
type OrderedVisit = VisitDate & { id: string; createdAt: Date };

// 只识别明确写出的年月日（兼容范围分隔符如 ~ / - / — / 至），缺少的月份和日期保持未知。
export function dateKeyFromLabel(value: string): number {
  const match = /^(\d{4})(?=$|[\s./年~～—–至-])(?:\s*[./年-]\s*(\d{1,2})(?=$|[\s./月~～—–至-])(?:\s*[./月-]\s*(\d{1,2})(?=$|[\s日~～—–至-]))?)?/.exec(value.trim());
  if (!match) return 0;
  const [, year, month, day] = match;
  const validMonth = month && Number(month) >= 1 && Number(month) <= 12 ? Number(month) : 0;
  const validDay = validMonth && day && Number(day) >= 1 && Number(day) <= 31 ? Number(day) : 0;
  return Number(year) * 10000 + validMonth * 100 + validDay;
}

// 精确日期用于排序和显示，老记录的自由描述单独保留。
export function visitDateKey({ happenedAt, whenLabel }: VisitDate): number {
  return happenedAt ? happenedAt.getUTCFullYear() * 10000 + (happenedAt.getUTCMonth() + 1) * 100 + happenedAt.getUTCDate() : dateKeyFromLabel(whenLabel);
}

// 显示文字和排序键使用同一个 UTC 日期。
export function getVisitDate({ happenedAt, whenLabel }: VisitDate) {
  if (happenedAt) {
    const iso = happenedAt.toISOString().slice(0, 10);
    return { label: formatDate(happenedAt), dateTime: iso, key: visitDateKey({ happenedAt, whenLabel }) };
  }
  return { label: whenLabel.trim() || "日期待补充", dateTime: undefined, key: dateKeyFromLabel(whenLabel) };
}

// 同一地点按从早到晚排列，日期未知的记录放在最后。
export function sortPlaceVisits<T extends OrderedVisit>(visits: readonly T[]): T[] {
  return [...visits].sort((a, b) => (visitDateKey(a) || Infinity) - (visitDateKey(b) || Infinity)
    || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

// 目录选取最近一次有时间线索的到访，未知日期仅在没有日期时作为回退。
export function latestPlaceVisit<T extends OrderedVisit>(visits: readonly T[]): T | undefined {
  let latest: T | undefined;
  let latestKey = -1;
  for (const visit of visits) {
    const key = visitDateKey(visit);
    if (!latest || key > latestKey || (key === latestKey && (visit.createdAt > latest.createdAt ||
      (visit.createdAt.getTime() === latest.createdAt.getTime() && visit.id.localeCompare(latest.id) > 0)))) {
      latest = visit;
      latestKey = key;
    }
  }
  return latest;
}

// 旧手记没有同行人时保留未知状态。
export function visitGroupLabel(labels: VisitGroupLabels, group: string | null | undefined): string {
  const key = VISIT_GROUPS.find(value => value === group);
  return key ? labels[key] : "同行人待补充";
}

// 同一地点的每次到访可分别被对应同行人筛选到。
export function placeVisitGroups(visits: ReadonlyArray<{ group: string | null }>): VisitGroup[] {
  return VISIT_GROUPS.filter(group => visits.some(visit => visit.group === group));
}
