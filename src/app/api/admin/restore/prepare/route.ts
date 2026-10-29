import { NextRequest, NextResponse } from "next/server";
import { prepareRestore, MAX_BACKUP_ZIP } from "@/lib/backup-restore";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员操作恢复" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 415 });
  const declared = Number(request.headers.get("content-length") || "0");
  if (!declared || declared > MAX_BACKUP_ZIP + 10_000)
    return NextResponse.json({ error: "备份 ZIP 最大 48 MiB" }, { status: declared ? 413 : 411 });
  try {
    const data = await request.formData();
    const file = data.get("backup");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择 ZIP 文件" }, { status: 400 });
    const preview = await prepareRestore(file, admin.id);
    return NextResponse.json(preview, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "备份检查失败" }, { status: 400, headers: noStore });
  }
}
