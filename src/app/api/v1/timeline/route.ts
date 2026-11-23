import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { latestPlaceVisit, visitDateSelect } from "@/lib/place-visits";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "visits:read");
  if (!user) return NextResponse.json({ error: "requires visits:read" }, { status: 401 });
  const entries = await prisma.timelineEntry.findMany({
    orderBy: [{ year: "asc" }, { sortOrder: "asc" }],
    include: {
      places: {
        orderBy: { sortOrder: "asc" },
        include: { place: { select: { id: true, name: true, region: true, isArchived: true, visits: { where: { deletedAt: null }, select: visitDateSelect } } } },
      },
    },
  });
  return NextResponse.json({
    items: entries.map(({ places, ...entry }) => ({
      ...entry,
      placeIds: places.map(link => link.placeId),
      places: places.map(({ place: { visits, ...place } }) => {
        const latest = latestPlaceVisit(visits);
        return { ...place, group: latest?.group ?? null, whenLabel: latest?.happenedAt?.toISOString().slice(0, 10) ?? latest?.whenLabel ?? "" };
      }),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
