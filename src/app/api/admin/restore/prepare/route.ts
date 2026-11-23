import { NextRequest, NextResponse } from "next/server";
import { prepareRestore } from "@/lib/backup-restore";
import { MAX_DIRECT_BACKUP_ZIP } from "@/lib/backup-format";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员操作恢复" }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 415, headers: noStore });
  const declaredHeader = request.headers.get("content-length");
  if (!declaredHeader)
    return NextResponse.json({ error: "直接上传最大 48 MiB，大文件请使用网页分块上传" }, { status: 411, headers: noStore });
  const declared = Number(declaredHeader);
  if (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_DIRECT_BACKUP_ZIP + 10_000)
    return NextResponse.json({ error: "直接上传最大 48 MiB，大文件请使用网页分块上传" }, { status: 413, headers: noStore });
  try {
    const data = await request.formData();
    const file = data.get("backup");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择 ZIP 文件" }, { status: 400, headers: noStore });
    const preview = await prepareRestore(file, admin.id);
    return NextResponse.json(preview, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "备份检查失败" }, { status: 400, headers: noStore });
  }
}
