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

export function RestoreBackupForm({ allowUpload = true }: { allowUpload?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<RestoreState | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/restore/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => {});
  }, []);

  async function checkBackup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setWorking(true); setMessage(""); setPreview(null); setConfirmed(false);
    try {
      const form = new FormData();
      form.set("backup", file);
      const response = await fetch("/api/admin/restore/prepare", {
        method: "POST", body: form, cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "备份校验失败");
      setPreview(data);
      setMessage("校验通过！请核对记录数量，再决定是否恢复。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "上传失败"); }
    finally { setWorking(false); }
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
      <p className="muted-copy">支持 travel.db 和 legacy-images/、uploads/ 图片目录组成的 ZIP，文件最大 48 MiB。文件先上传到本实例的持久化目录进行安全检查，不会直接覆盖正在使用的数据库。</p>
      <label>选择 ZIP 文件
        <input type="file" accept=".zip,application/zip" onChange={e => {
          setFile(e.target.files?.[0] || null);
          setPreview(null); setConfirmed(false); setMessage("");
        }}/>
      </label>
      <button className="button button-dark" type="submit" disabled={working || !file || status?.state === "PENDING_RESTART"}>
        {working ? "正在处理…" : "上传并校验"}
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
