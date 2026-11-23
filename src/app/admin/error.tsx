"use client";

import Link from "next/link";
import { useEffect } from "react";

// 为管理后台路由段提供统一的错误恢复界面，避免异常直接退化为裸错误页。
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  const message = error instanceof Error && error.message && !error.message.includes("Server Components render")
    ? error.message
    : "操作未能完成，可能是数据已在别处变更或连接暂时中断。";

  return (
    <main>
      <div className="admin-page-heading">
        <p className="eyebrow">EDITORIAL DESK · ERROR</p>
        <h1>页面暂时遇到问题</h1>
        <p>{message}</p>
      </div>
      <section className="admin-panel">
        <div className="admin-save-row">
          <button type="button" className="button button-dark" onClick={() => retry()}>重试当前页面</button>
          <Link className="admin-back" href="/admin">返回编辑室首页</Link>
        </div>
      </section>
    </main>
  );
}
