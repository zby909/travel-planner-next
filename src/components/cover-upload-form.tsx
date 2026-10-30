"use client";

import Image from "next/image";
import { useActionState } from "react";
import { uploadCoverAction } from "@/app/admin/cover-actions";

// 两个人可以直接从手机或电脑选照片作为地点封面。
export function CoverUploadForm({ id, kind, imageUrl }: {
  id: string; kind: "destination" | "place"; imageUrl: string;
}) {
  const [state, action, pending] = useActionState(uploadCoverAction, { error: "" });
  return <form action={action} className="admin-panel admin-form" encType="multipart/form-data">
    <h2>地点封面照片</h2>
    <Image src={imageUrl} alt="当前地点封面" width={320} height={192} unoptimized className="admin-cover-preview" />
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="kind" value={kind} />
    <label>更换照片<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required /></label>
    <p className="muted-copy">支持 JPG、PNG、WebP，最大 8 MiB。自动压缩并删除 GPS/EXIF；封面会显示在无需登录的公开页面，请勿上传不希望公开的私密照片。</p>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <div className="admin-save-row"><button className="button button-dark" type="submit" disabled={pending}>{pending ? "上传中…" : "保存封面照片"}</button></div>
  </form>;
}
