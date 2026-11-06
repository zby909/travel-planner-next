import { NextRequest, NextResponse } from "next/server";
import { createBackupArchive } from "@/lib/backup-export";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 只允许同源管理员主动生成备份，不接受查询参数中的路径或凭据。
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员导出备份" }, { status: 403, headers: noStore });
  try {
    const { bytes, fileName } = await createBackupArchive(admin.id);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      ...noStore, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
    } });
  } catch (error) {
    console.error("Backup export failed", error);
    const message = error instanceof Error && !('code' in error) ? error.message : "备份生成失败，请检查服务器存储和日志";
    return NextResponse.json({ error: message }, { status: 409, headers: noStore });
  }
}
