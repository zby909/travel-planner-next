import type { Prisma } from "@prisma/client";

// 关联任一归档地点的时间轴暂不展示，恢复地点后自动重新出现。
export const visibleTimelineWhere = {
  places: { none: { place: { isArchived: true } } },
} satisfies Prisma.TimelineEntryWhereInput;

// 只有已归入展示中地点的到访才公开呈现，旧手记可以在后台归类。
export const visibleMemoryWhere = {
  deletedAt: null,
  place: { isArchived: false },
} satisfies Prisma.TravelMemoryWhereInput;
