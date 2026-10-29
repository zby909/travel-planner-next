import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreStatus } from "@/lib/backup-restore";

export const runtime = "nodejs";
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await restoreStatus(admin.id), { headers: { "Cache-Control": "no-store" } });
}
