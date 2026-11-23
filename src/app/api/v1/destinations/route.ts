import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { parseJsonArray } from "@/lib/format";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "destinations:read");
  if (!user) return NextResponse.json({ error: "requires destinations:read" }, { status: 401 });
  const entries = await prisma.destination.findMany({ orderBy: { rank: "asc" },
    include: { guide: { include: { days: { orderBy: { sortOrder: "asc" } } } } },
  });
  const items = entries.map(({ typesJson, seasonsJson, spotsJson, routeJson, guide, ...entry }) => ({
    ...entry, types: parseJsonArray(typesJson), seasons: parseJsonArray(seasonsJson),
    spots: parseJsonArray(spotsJson), route: parseJsonArray(routeJson),
    guideDays: guide?.days.map(day => ({ title: day.title, detail: day.detail })) ?? [],
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
