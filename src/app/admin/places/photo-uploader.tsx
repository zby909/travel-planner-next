"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
type PendingPhoto = { file: File; requestId: string };

// 通过浏览器 XHR 上传单张照片，并显示实际网络发送进度。
function sendPhoto(placeId: string, photo: PendingPhoto, onProgress: (value: number) => void,
  onProcessing: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("placeId", placeId);
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
export function PhotoUploader({ placeId, existingCount }: { placeId: string; existingCount: number }) {
  const router = useRouter();
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [current, setCurrent] = useState("");
  const [finished, setFinished] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);

  // 依次提交选中的照片，更新当前文件进度，并在失败时保留剩余队列。
  async function upload() {
    if (busy || !files.length) return;
    if (existingCount + files.length > 120) {
      setError("每个地点最多保存 120 张照片");
      return;
    }
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
        await sendPhoto(placeId, photo, setPercent, () => setPhase("服务器正在处理照片…"));
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

  return <div className="photo-upload">
    <label>选择照片
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
        onChange={event => {
          const selected = Array.from(event.target.files ?? []);
          event.target.value = "";
          setError("");
          setPhase("");
          setPercent(0);
          setFinished(0);
          setRetry(false);
          if (selected.some(file => file.size < 20 || file.size > MAX_FILE_BYTES ||
              !MIME_TYPES.includes(file.type))) {
            setFiles([]);
            setError("仅支持 JPG、PNG、WebP，单张最大 20 MiB");
          } else {
            setFiles(selected.map(file => ({ file, requestId: crypto.randomUUID() })));
          }
        }} />
    </label>
    <p className="muted-copy">支持多选，逐张上传并显示进度。成功的照片立即保存，失败后可以重试剩余照片。上传期间请保持页面打开。</p>
    {files.length ? <p className="photo-upload-queue">已选择 {files.length} 张照片</p> : null}
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
