import type { Prisma } from "@prisma/client";

// 关联任一归档地点的时间轴暂不展示，恢复地点后自动重新出现。
export const visibleTimelineWhere = {
  places: { none: { place: { isArchived: true } } },
} satisfies Prisma.TimelineEntryWhereInput;

// 不关联地点或关联展示中地点的日记可以在前台呈现。
export const visibleMemoryWhere = {
  OR: [{ placeId: null }, { place: { isArchived: false } }],
} satisfies Prisma.TravelMemoryWhereInput;
