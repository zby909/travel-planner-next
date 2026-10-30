import { NextRequest, NextResponse } from "next/server";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";
import { RESTORE_CHUNK_SIZE, saveRestoreChunk } from "@/lib/restore-upload";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const admin = await restoreAdministrator(request);
  if (!admin) return NextResponse.json({ error: "仅允许同源管理员上传" }, { status: 403 });
  const id = request.headers.get("x-upload-id") || "";
  const index = Number(request.headers.get("x-chunk-index"));
  const sha256 = request.headers.get("x-chunk-sha256") || "";
  if (request.headers.get("content-type") !== "application/octet-stream")
    return NextResponse.json({ error: "分块必须使用 application/octet-stream" }, { status: 415 });
  const declaredHeader = request.headers.get("content-length");
  const declared = declaredHeader ? Number(declaredHeader) : 0;
  if (declared > RESTORE_CHUNK_SIZE)
    return NextResponse.json({ error: "分块大小无效" }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error("缺少分块内容");
    const buffers: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > RESTORE_CHUNK_SIZE) {
        await reader.cancel();
        throw Error("分块超过 512 KiB 限制");
      }
      buffers.push(Buffer.from(value));
    }
    const result = await saveRestoreChunk(id, admin.id, index, Buffer.concat(buffers, total), sha256);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "分块上传失败" }, { status: 400, headers: noStore });
  }
}
