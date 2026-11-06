import { NextRequest, NextResponse } from "next/server";
import { photoUploadEditor } from "@/lib/place-photo-auth";
import { PHOTO_MAX_BYTES, uploadPlacePhoto } from "@/lib/place-photo-storage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

// 普通单张图片上传接口；前端用 XHR 显示进度，不创建分块任务和续传会话。
export async function POST(request: NextRequest) {
  const actor = await photoUploadEditor(request);
  if (!actor) return NextResponse.json({ error: "需要登录并从本站上传照片" }, { status: 403, headers });
  const maxBody = PHOTO_MAX_BYTES + 128 * 1024;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!Number.isSafeInteger(Number(declaredLength)) ||
    Number(declaredLength) < 1 || Number(declaredLength) > maxBody)) {
    return NextResponse.json({ error: "上传数据大小无效或超过限制" }, { status: 413, headers });
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;"))
    return NextResponse.json({ error: "上传格式无效" }, { status: 415, headers });
  try {
    // 不依赖反向代理提供 Content-Length，读取实际数据时限流，避免超大表单占满内存。
    const reader = request.body?.getReader();
    if (!reader) throw Error("缺少照片数据");
    const parts: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBody) {
        await reader.cancel();
        return NextResponse.json({ error: "单张照片不能超过 20 MiB" }, { status: 413, headers });
      }
      parts.push(Buffer.from(value));
    }
    const form = await new Response(new Uint8Array(Buffer.concat(parts, total)),
      { headers: { "Content-Type": contentType } }).formData();
    const placeId = form.get("placeId");
    const image = form.get("image");
    const requestId = form.get("requestId");
    if (typeof placeId !== "string" || typeof requestId !== "string" || !(image instanceof File))
      throw Error("请选择照片和有效地点");
    return NextResponse.json(await uploadPlacePhoto(placeId, actor.id, image, requestId), {
      status: 201, headers,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "照片上传失败" },
      { status: 400, headers });
  }
}
