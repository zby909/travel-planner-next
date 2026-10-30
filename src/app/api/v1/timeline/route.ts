import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "visits:read");
  if (!user) return NextResponse.json({ error: "requires visits:read" }, { status: 401 });
  const entries = await prisma.timelineEntry.findMany({
    orderBy: [{ year: "asc" }, { sortOrder: "asc" }],
    include: {
      places: {
        orderBy: { sortOrder: "asc" },
        include: { place: { select: { id: true, name: true, region: true, group: true, whenLabel: true } } },
      },
    },
  });
  return NextResponse.json({
    items: entries.map(({ places, ...entry }) => ({
      ...entry,
      placeIds: places.map(link => link.placeId),
      places: places.map(link => link.place),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
