import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request, "destinations:read");
  if (!user) return NextResponse.json({ error: "requires destinations:read" }, { status: 401 });
  const items = await prisma.destination.findMany({ orderBy: { rank: "asc" },
    select: { id: true, title: true, subtitle: true, months: true, days: true, minBudget: true, maxBudget: true, imagePath: true },
  });
  return NextResponse.json({ items });
}
