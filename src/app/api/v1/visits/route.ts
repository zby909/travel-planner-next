import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "visits:read");
  if (!user) return NextResponse.json({ error: "requires visits:read" }, { status: 401 });
  const entries = await prisma.visitedPlace.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, region: true, group: true, whenLabel: true, latitude: true, longitude: true,
      country: true, province: true, city: true, mapNote: true, image: true, sortOrder: true },
  });
  return NextResponse.json({ items: entries });
}
