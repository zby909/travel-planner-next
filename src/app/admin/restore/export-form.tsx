"use client";

import { useState } from "react";

// 管理员主动下载 ZIP，不把包含账号和私密照片的备份暴露为公开链接。
export function ExportBackupForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  // 下载完成后回收临时对象 URL，生成失败时展示可重试的提示。
  async function downloadBackup() {
    setPending(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/admin/backup", { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "备份生成失败");
      }
      const bytes = await response.blob();
      const url = URL.createObjectURL(bytes);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] || "travel-backup.zip";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("备份已生成并交给浏览器下载。请确认文件下载完成，并存放在站点之外的私人位置。");
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "备份下载失败，请重试");
    } finally { setPending(false); }
  }

  return <section className="admin-panel">
    <h2>导出当前旅行档案</h2>
    <p className="muted-copy">导出 SQLite 一致性快照、上传照片和历史图片，包含已归档记录、计划、费用与日记。复制快照时会短暂暂停写入，随后即可继续编辑。</p>
    <p className="muted-copy">ZIP 含账号哈希和私密数据，未加密；请只保存在自己的安全设备，不要发送到 AI 或公开分享。网页备份最大 48 MiB，超限请按文档做停机备份。</p>
    <button className="button button-dark" type="button" disabled={pending} onClick={downloadBackup}>{pending ? "正在生成备份…" : "生成并下载备份 ZIP"}</button>
    {message ? <p className={error ? "form-error" : "form-success"} role="status">{message}</p> : null}
  </section>;
}
