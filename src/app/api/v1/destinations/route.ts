import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "destinations:read");
  if (!user) return NextResponse.json({ error: "requires destinations:read" }, { status: 401 });
  const entries = await prisma.destination.findMany({ orderBy: { rank: "asc" },
    include: { flightPricing: true, guide: { include: { days: { orderBy: { sortOrder: "asc" } } } } },
  });
  const parseArray = (value: string) => {
    try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  };
  const items = entries.map(({ spotsJson, routeJson, guide, ...entry }) => ({
    ...entry, spots: parseArray(spotsJson), route: parseArray(routeJson),
    guideDays: guide?.days.map(day => ({ title: day.title, detail: day.detail })) ?? [],
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
