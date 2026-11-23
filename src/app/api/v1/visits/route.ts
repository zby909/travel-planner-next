import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { latestPlaceVisit, sortPlaceVisits, visitDateSelect } from "@/lib/place-visits";
export const dynamic = "force-dynamic";

// 保留地点摘要字段，同时提供每次到访的 ID、日期与同行人。
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "visits:read");
  if (!user) return NextResponse.json({ error: "requires visits:read" }, { status: 401 });
  const entries = await prisma.visitedPlace.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, region: true, latitude: true, longitude: true,
      country: true, province: true, city: true, mapNote: true, image: true, sortOrder: true, isArchived: true,
      visits: { where: { deletedAt: null }, select: { ...visitDateSelect, title: true, revision: true } } },
  });
  const items = entries.map(({ visits, ...place }) => {
    const latest = latestPlaceVisit(visits);
    return {
      ...place, group: latest?.group ?? null,
      whenLabel: latest?.happenedAt?.toISOString().slice(0, 10) ?? latest?.whenLabel ?? "",
      visits: sortPlaceVisits(visits).map(({ id, group, happenedAt, whenLabel, title, revision }) => ({ id, group, happenedAt, whenLabel, title, revision })),
    };
  });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
