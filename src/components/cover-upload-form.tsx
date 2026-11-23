"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { uploadCoverAction } from "@/app/admin/cover-actions";

const MAX_COVER_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// 两个人可以直接从手机或电脑选照片作为目的地封面，前端先拦截超大文件以免触发请求体限制。
export function CoverUploadForm({ id, imageUrl }: {
  id: string; imageUrl: string;
}) {
  const [state, action, pending] = useActionState(uploadCoverAction, { error: "" });
  const [clientError, setClientError] = useState("");
  const error = clientError || state.error;
  return <form action={action} className="admin-panel admin-form">
    <h2>目的地封面照片</h2>
    <Image src={imageUrl} alt="当前目的地封面" width={320} height={192} unoptimized className="admin-cover-preview" />
    <input type="hidden" name="id" value={id} />
    <label>更换照片<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" required onChange={event => {
      const file = event.target.files?.[0];
      if (!file) { setClientError(""); return; }
      if (file.size < 20 || file.size > MAX_COVER_BYTES) {
        event.target.value = "";
        setClientError("请选择不超过 8 MiB 的照片");
      } else if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        event.target.value = "";
        setClientError("只支持 JPG、PNG、WebP、AVIF 照片");
      } else {
        setClientError("");
      }
    }} /></label>
    <p className="muted-copy">支持 JPG、PNG、WebP、AVIF，最大 8 MiB。自动压缩并删除 GPS/EXIF；封面遵循站点的公开/私密和归档设置。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-save-row"><button className="button button-dark" type="submit" disabled={pending || Boolean(clientError)}>{pending ? "上传中…" : "保存封面照片"}</button></div>
  </form>;
}
