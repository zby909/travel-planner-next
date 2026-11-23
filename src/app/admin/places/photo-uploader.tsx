"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PHOTO_MAX_BYTES } from "@/lib/place-album-limits";

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
type PendingPhoto = { file: File; requestId: string };

// 通过浏览器 XHR 上传单张照片，并显示实际网络发送进度。
function sendPhoto(placeId: string, visitId: string, photo: PendingPhoto, onProgress: (value: number) => void,
  onProcessing: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("placeId", placeId);
    body.append("visitId", visitId);
    body.append("requestId", photo.requestId);
    body.append("image", photo.file);
    xhr.open("POST", "/api/admin/place-photos");
    xhr.withCredentials = true;
    xhr.timeout = 180000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    xhr.upload.onload = onProcessing;
    xhr.onerror = () => reject(Error("网络连接失败，请重试这张照片"));
    xhr.ontimeout = () => reject(Error("上传等待超时，请重试这张照片"));
    xhr.onabort = () => reject(Error("上传已取消"));
    xhr.onload = () => {
      if (xhr.status === 201) {
        onProgress(100);
        resolve();
        return;
      }
      let message = "照片保存失败，请重试";
      try { message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message; }
      catch { /* 非 JSON 错误响应使用统一提示。 */ }
      reject(Error(message));
    };
    xhr.send(body);
  });
}

// 多张照片按顺序上传，失败后仅保留未完成的照片，不重复提交已成功的照片。
export function PhotoUploader({ placeId, visitId, usage, limits }: {
  placeId: string; visitId: string; usage: { count: number; bytes: number }; limits: { maxPhotos: number; maxBytes: number };
}) {
  const router = useRouter();
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [current, setCurrent] = useState("");
  const [finished, setFinished] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const remaining = Math.max(0, limits.maxPhotos - usage.count);
  const full = remaining === 0 || usage.bytes >= limits.maxBytes;

  // 统一校验通过文件选择或拖拽加入的照片列表，并对常见的 iPhone HEIC 给出明确提示。
  function acceptFiles(selected: File[]) {
    setError("");
    setPhase("");
    setPercent(0);
    setFinished(0);
    setRetry(false);
    if (!selected.length) return;
    if (selected.length > remaining) {
      setFiles([]);
      setError(`这个地点还能添加 ${remaining} 张照片，请重新选择`);
    } else if (selected.some(file => /\.heic$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif")) {
      setFiles([]);
      setError("暂不支持直接上传 HEIC 格式，请在手机相册转为 JPG 或在 iPhone「设置 → 相机 → 格式」开启兼容性最佳后重试");
    } else if (selected.some(file => file.size < 20 || file.size > PHOTO_MAX_BYTES || !MIME_TYPES.includes(file.type))) {
      setFiles([]);
      setError("仅支持 JPG、PNG、WebP、AVIF，单张最大 20 MiB");
    } else {
      setFiles(selected.map(file => ({ file, requestId: crypto.randomUUID() })));
    }
  }

  // 依次提交选中的照片，更新当前文件进度，并在失败时保留剩余队列。
  async function upload() {
    if (busy || !files.length) return;
    setBusy(true);
    setError("");
    setPhase("");
    setRetry(false);
    let uploaded = 0;
    try {
      for (const photo of files) {
        setCurrent(photo.file.name);
        setPercent(0);
        setPhase("正在上传…");
        await sendPhoto(placeId, visitId, photo, setPercent, () => setPhase("服务器正在处理照片…"));
        uploaded++;
        setFinished(uploaded);
      }
      setFiles([]);
      setCurrent("");
      setPercent(100);
      setPhase(`已上传 ${uploaded} 张照片。`);
      router.refresh();
    } catch (cause) {
      setFiles(files.slice(uploaded));
      setCurrent("");
      setPercent(0);
      setFinished(0);
      setRetry(true);
      setPhase(uploaded ? `已保存 ${uploaded} 张，剩余照片可以重试。` : "");
      setError(cause instanceof Error ? cause.message : "照片上传失败，请重试");
      if (uploaded) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div
    className={`photo-upload${dragOver ? " is-dragover" : ""}`}
    onDragOver={event => {
      if (busy || full) return;
      event.preventDefault();
      setDragOver(true);
    }}
    onDragLeave={() => setDragOver(false)}
    onDrop={event => {
      event.preventDefault();
      setDragOver(false);
      if (busy || full) return;
      acceptFiles(Array.from(event.dataTransfer.files ?? []));
    }}
  >
    <label className="photo-upload-dropzone">
      <strong>拖入照片到这里，或点击从相册批量选择</strong>
      <span>支持 JPG、PNG、WebP、AVIF（单张最大 {PHOTO_MAX_BYTES / 1024 ** 2} MiB，自动压缩并去除拍摄定位）</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={busy || full}
        onChange={event => {
          const selected = Array.from(event.target.files ?? []);
          event.target.value = "";
          acceptFiles(selected);
        }} />
    </label>
    <p className="muted-copy">该地点已用 {usage.count}/{limits.maxPhotos} 张 · {(usage.bytes / 1024 ** 2).toFixed(1)}/{limits.maxBytes / 1024 ** 2} MiB。</p>
    {full ? <p className="muted-copy">地点相册已达上限，腾出空间后可以继续上传。</p> : null}
    {files.length ? <div className="photo-upload-queue">
      <span>已准备 {files.length} 张照片{files.length <= 3 ? `（${files.map(item => item.file.name).join("、")}）` : ""}</span>
      {!busy ? <button type="button" className="admin-text-action" onClick={() => { setFiles([]); setRetry(false); setError(""); }}>清空</button> : null}
    </div> : null}
    {busy || percent > 0 ? <div className="photo-upload-progress">
      <div className="photo-upload-progress-meta">
        <span>{busy ? `第 ${finished + 1}/${files.length} 张：${current}` : "上传完成"}</span>
        <strong>{percent}%</strong>
      </div>
      <progress max={100} value={percent} aria-label="照片上传进度" />
    </div> : null}
    {phase ? <p className="muted-copy" role="status">{phase}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="admin-save-row">
      <button type="button" className="button button-dark" disabled={!files.length || busy}
        onClick={() => { void upload(); }}>
        {busy ? "上传中…" : retry ? "重试剩余照片" : "开始上传照片"}
      </button>
    </div>
  </div>;
}
