import { NextRequest, NextResponse } from "next/server";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";
import { beginRestoreUpload } from "@/lib/restore-upload";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员操作恢复" }, { status: 403 });
  try {
    const result = await beginRestoreUpload(await request.json(), admin.id);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建上传任务" }, { status: 400, headers: noStore });
  }
}
