import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.travelMemory.findFirst({ select: { revision: true, albumRevision: true, deletedAt: true } });
    return NextResponse.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
