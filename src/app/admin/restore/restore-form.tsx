"use client";

import { useEffect, useState, type FormEvent } from "react";

type Preview = {
  id: string;
  counts: { destinations: number; places: number; timeline: number; users: number; photos: number };
  images: { legacy: number; uploads: number };
  warnings: string[];
  expiresAt: string;
};
type RestoreState = { state: string; error?: string; completedAt?: string; id?: string };
type UploadProgress = {
  phase: "hashing" | "uploading" | "verifying" | "complete" | "interrupted";
  sentBytes: number;
  totalBytes: number;
  chunkIndex: number;
  chunkCount: number;
  resumed?: boolean;
};

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(buffer: ArrayBuffer) {
  return hex(await crypto.subtle.digest("SHA-256", buffer));
}
function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + " MiB" : (bytes / 1024).toFixed(0) + " KiB";
}
function sendChunk(uploadId: string, index: number, bytes: ArrayBuffer, checksum: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/restore/upload/chunk");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Upload-Id", uploadId);
    xhr.setRequestHeader("X-Chunk-Index", String(index));
    xhr.setRequestHeader("X-Chunk-SHA256", checksum);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = event => onProgress(event.loaded);
    xhr.onload = () => {
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(data.error || "第 " + (index + 1) + " 个分块上传失败（HTTP " + xhr.status + "）"));
    };
    xhr.onerror = () => reject(new Error("网络中断"));
    xhr.ontimeout = () => reject(new Error("分块上传超时"));
    xhr.send(bytes);
  });
}

export function RestoreBackupForm({ allowUpload = true }: { allowUpload?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<RestoreState | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    void fetch("/api/admin/restore/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => {});
  }, []);

  async function checkBackup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    if (file.size < 100 || file.size > 48 * 1024 * 1024) {
      setMessage("ZIP 大小需在 100 B 到 48 MiB 之间");
      return;
    }
    setWorking(true); setMessage(""); setPreview(null); setConfirmed(false);
    try {
      const bytes = await file.arrayBuffer();
      const totalHash = await sha256(bytes);
      const chunkSize = 512 * 1024;
      const chunkCount = Math.ceil(bytes.byteLength / chunkSize);
      const chunkHashes: string[] = [];
      setProgress({ phase: "hashing", sentBytes: 0, totalBytes: bytes.byteLength, chunkIndex: 0, chunkCount });
      for (let index = 0; index < chunkCount; index++) {
        const start = index * chunkSize;
        const part = bytes.slice(start, Math.min(bytes.byteLength, start + chunkSize));
        chunkHashes.push(await sha256(part));
        setProgress({ phase: "hashing", sentBytes: Math.min(bytes.byteLength, start + part.byteLength),
          totalBytes: bytes.byteLength, chunkIndex: index + 1, chunkCount });
      }

      const initResponse = await fetch("/api/admin/restore/upload/init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size, sha256: totalHash, chunkHashes }),
        cache: "no-store",
      });
      const session = await initResponse.json();
      if (!initResponse.ok) throw new Error(session.error || "无法创建上传任务");
      const received = new Set<number>(session.receivedChunks as number[]);
      let sentBytes = 0;
      for (const index of received) {
        sentBytes += Math.min(chunkSize, bytes.byteLength - index * chunkSize);
      }
      setProgress({ phase: "uploading", sentBytes, totalBytes: bytes.byteLength,
        chunkIndex: received.size, chunkCount, resumed: Boolean(session.resumed) });

      for (let index = 0; index < chunkCount; index++) {
        if (received.has(index)) continue;
        const start = index * chunkSize;
        const part = bytes.slice(start, Math.min(bytes.byteLength, start + chunkSize));
        await sendChunk(session.uploadId, index, part, chunkHashes[index], loaded => {
          setProgress({ phase: "uploading", sentBytes: sentBytes + loaded, totalBytes: bytes.byteLength,
            chunkIndex: index + 1, chunkCount, resumed: Boolean(session.resumed) });
        });
        sentBytes += part.byteLength;
        setProgress({ phase: "uploading", sentBytes, totalBytes: bytes.byteLength,
          chunkIndex: index + 1, chunkCount, resumed: Boolean(session.resumed) });
      }

      setProgress({ phase: "verifying", sentBytes: bytes.byteLength, totalBytes: bytes.byteLength,
        chunkIndex: chunkCount, chunkCount, resumed: Boolean(session.resumed) });
      const response = await fetch("/api/admin/restore/upload/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: session.uploadId }), cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "备份校验失败");
      setPreview(data);
      setProgress({ phase: "complete", sentBytes: bytes.byteLength, totalBytes: bytes.byteLength,
        chunkIndex: chunkCount, chunkCount, resumed: Boolean(session.resumed) });
      setMessage("上传及校验通过！请核对记录数量，再决定是否恢复。");
    } catch (e) {
      setProgress(current => current ? { ...current, phase: "interrupted" } : null);
      setMessage((e instanceof Error ? e.message : "上传失败") + "。如果已开始上传，已接收的分块会保留 2 小时；重新选择同一个 ZIP 并再次上传即可自动续传。");
    } finally { setWorking(false); }
  }

  async function confirm() {
    if (!preview || !confirmed) return;
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/admin/restore/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: preview.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "确认失败");
      setStatus({ state: "PENDING_RESTART", id: preview.id });
      setPreview(null);
      setMessage("恢复任务已保存。现在请到 StackNest 对此应用执行「重启」。重启后数据和配图自动恢复，无需手动放文件。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "确认失败"); }
    finally { setWorking(false); }
  }

  const percent = progress ? Math.min(100, Math.round(progress.sentBytes / Math.max(1, progress.totalBytes) * 100)) : 0;
  const phaseText = progress?.phase === "hashing" ? "正在计算文件校验值"
    : progress?.phase === "uploading" ? (progress.resumed ? "正在续传备份" : "正在分块上传")
    : progress?.phase === "verifying" ? "上传完成，正在校验 ZIP 与 SQLite"
    : progress?.phase === "complete" ? "上传及校验完成"
    : progress?.phase === "interrupted" ? "上传中断，可继续续传" : "";

  return <div className="restore-flow">
    {status?.state === "PENDING_RESTART" && <div className="restore-status" role="status">
      <strong>等待应用重启</strong>
      <p>已确认恢复任务。请在 StackNest 重启当前 Docker 应用；服务将在启动前恢复数据库和媒体文件。</p>
    </div>}
    {status?.state === "APPLIED" && <div className="restore-status" role="status">
      <strong>最近一次备份已成功恢复</strong>
      <p>{status.completedAt ? new Date(status.completedAt).toLocaleString("zh-CN") : "完成"}。当前管理员账号及密码保持不变，旧 Token 已停用。</p>
    </div>}
    {status?.state === "FAILED" && <p className="form-error" role="alert">
      最近一次恢复失败：{status.error || "请检查容器日志"}。原数据库已保留，请检查日志后重新上传。
    </p>}
    {allowUpload && <form className="admin-form admin-panel" onSubmit={checkBackup}>
      <h2>上传历史备份 ZIP</h2>
      <p className="muted-copy">支持 travel.db 和 legacy-images/、uploads/ 图片目录组成的 ZIP，文件最大 48 MiB。采用 512 KiB 分块上传，网络中断或刷新后重新选择同一个文件即可续传；分块临时保存在持久化目录，2 小时后过期。</p>
      <label>选择 ZIP 文件
        <input type="file" accept=".zip,application/zip" disabled={working || status?.state === "PENDING_RESTART"} onChange={e => {
          setFile(e.target.files?.[0] || null);
          setPreview(null); setConfirmed(false); setMessage(""); setProgress(null);
        }}/>
      </label>
      {progress && <div className="restore-upload-progress" role="status" aria-live="polite">
        <div className="restore-upload-progress-heading">
          <strong>{phaseText}</strong>
          <span>{percent}%</span>
        </div>
        <div className="restore-upload-progress-track">
          <span className={progress.phase === "verifying" ? "is-indeterminate" : ""} style={{ width: progress.phase === "verifying" ? "36%" : percent + "%" }}/>
        </div>
        <p>{formatBytes(progress.sentBytes)} / {formatBytes(progress.totalBytes)}
          {progress.chunkCount > 0 ? ` · 分块 ${Math.min(progress.chunkIndex, progress.chunkCount)}/${progress.chunkCount}` : ""}
        </p>
        {progress.phase === "interrupted" && <small>已完成的分块已保留。重新选择同一个文件并点击上传即可从断点继续。</small>}
      </div>}
      <button className="button button-dark" type="submit" disabled={working || !file || status?.state === "PENDING_RESTART"}>
        {working ? (progress?.phase === "verifying" ? "正在校验…" : "正在处理…") : progress?.phase === "interrupted" ? "继续上传并校验" : "上传并校验"}
      </button>
    </form>}

    {preview && <section className="admin-panel">
      <h2>恢复前预览</h2>
      <div className="restore-count-grid">
        <div><strong>{preview.counts.places}</strong><span>旅行足迹</span></div>
        <div><strong>{preview.counts.destinations}</strong><span>未来目的地</span></div>
        <div><strong>{preview.counts.timeline}</strong><span>时间轴</span></div>
        <div><strong>{preview.images.legacy + preview.images.uploads}</strong><span>媒体文件</span></div>
      </div>
      {preview.warnings.map((w, index) => <p className="muted-copy" key={index}>注意：{w}</p>)}
      <p className="muted-copy">为了避免旧备份中的管理员和授权令牌接管新站点，恢复后保留当前登录管理员的账号和密码，停用历史用户及全部旧授权令牌。</p>
      <label className="restore-confirm">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        我确认要用该备份替换这个空白实例中的旅行数据，重启后应用。
      </label>
      <button className="button button-dark" type="button" disabled={working || !confirmed} onClick={confirm}>确认恢复，重启后生效</button>
    </section>}
    {message && <p className={preview || status?.state === "PENDING_RESTART" ? "form-success" : "form-error"} role="status">{message}</p>}
  </div>;
}
