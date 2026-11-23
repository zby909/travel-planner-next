import { NextRequest, NextResponse } from "next/server";
import { createBackupArchive } from "@/lib/backup-export";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 将导出失败原因映射为固定错误码，避免在重定向查询串中回显任意文本。
function exportErrorCode(message: string): string {
  if (message.includes("正在生成")) return "busy";
  if (message.includes("容量") || message.includes("过大") || message.includes("512 MiB")) return "oversize";
  if (message.includes("缺少原始文件") || message.includes("大小与数据库记录不符")) return "missing-media";
  if (message.includes("符号链接") || message.includes("不受管")) return "invalid-media";
  return "failed";
}

// 只允许同源管理员主动生成备份，不接受查询参数中的路径或凭据。
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员导出备份" }, { status: 403, headers: noStore });
  try {
    const archive = await createBackupArchive(admin.id);
    const stream = createReadStream(/* turbopackIgnore: true */ archive.path);
    stream.once("close", () => { void archive.cleanup().catch(() => {}); });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { headers: {
      ...noStore, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${archive.fileName}"`,
      "Content-Length": String(archive.size),
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
    } });
  } catch (error) {
    console.error("Backup export failed", error);
    const message = error instanceof Error && !('code' in error) ? error.message : "备份生成失败，请检查服务器存储和日志";
    if (request.headers.get("accept")?.includes("text/html")) {
      return new Response(null, { status: 303, headers: { ...noStore, Location: `/admin/restore?exportError=${exportErrorCode(message)}#export-backup` } });
    }
    return NextResponse.json({ error: message }, { status: 409, headers: noStore });
  }
}
