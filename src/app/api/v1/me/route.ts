import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
export async function GET(request: NextRequest) {
  const user = await authenticateApi(request);
  if (!user) return NextResponse.json({ error: "invalid or expired API token" }, { status: 401 });
  return NextResponse.json({ user });
}
