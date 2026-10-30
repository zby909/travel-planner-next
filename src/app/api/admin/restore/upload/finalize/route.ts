import { NextRequest, NextResponse } from "next/server";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";
import { finishRestoreUpload } from "@/lib/restore-upload";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员完成上传" }, { status: 403 });
  try {
    const value = await request.json();
    if (typeof value?.uploadId !== "string") return NextResponse.json({ error: "缺少上传任务编号" }, { status: 400 });
    const preview = await finishRestoreUpload(value.uploadId, admin.id);
    return NextResponse.json(preview, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备份校验失败" }, { status: 400, headers: noStore });
  }
}
