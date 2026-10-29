"use client";

import { useState, useSyncExternalStore } from "react";

const repo = "https://github.com/zby909/travel-planner-next";
const subscribeToOrigin = () => () => {};

export function CliSetupGuide() {
  const server = useSyncExternalStore(subscribeToOrigin, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const command = server ? `travelctl auth login --server ${server}` : "travelctl auth login";

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  }

  return (
    <section className="admin-panel">
      <h2>第一次使用 AI 助手</h2>
      <p className="muted-copy">
        Skill 会先运行 <code>travelctl auth status</code>。如果还没连接网站，用户只需在自己的终端执行一次 <code>travelctl auth login</code>，
        CLI 会依次询问网站地址、授权令牌并验证；以后 CLI 自动读取保存的配置，无需重新输入。
      </p>
      <div className="cli-guide-steps">
        <div>
          <strong>① 安装 CLI</strong>
          <p>Windows 用户可从 GitHub Releases 直接下载 EXE（正式发布后）；开发者可用 npm 安装（发布后），不需要 ZIP 安装包。</p>
          <p><a className="source-link" href={`${repo}/releases`} target="_blank" rel="noopener noreferrer">GitHub Releases（Windows EXE）</a> · <a className="source-link" href={`${repo}/tree/main/cli`} target="_blank" rel="noopener noreferrer">CLI 源码 / 本地安装说明</a></p>
          <p className="muted-copy">目前 npm 包和 EXE 发行版仍在准备中，不能把它们当作已发布的安装包。</p>
        </div>
        <div>
          <strong>② 安装 AI Skill</strong>
          <p>从项目仓库获取 <code>skills/travel-import/SKILL.md</code>，按你使用的 Agent 的 Skill 安装方式添加。</p>
          <a className="source-link" href={`${repo}/tree/main/skills/travel-import`} target="_blank" rel="noopener noreferrer">查看 travel-import Skill</a>
        </div>
        <div>
          <strong>③ 首次授权（只需一次）</strong>
          <p>先在下方创建授权令牌，在本地终端运行：</p>
          <div className="cli-copy-row">
            <code>{command}</code>
            <button className="admin-signout" type="button" onClick={copyCommand}>{copied ? "已复制" : "复制命令"}</button>
          </div>
          <p className="muted-copy">
            CLI 将在本地隐藏输入 Token 并检查有效性；不会将 Token 添加到命令参数或 AI 对话中。也可以只执行 <code>travelctl auth login</code>，
            由 CLI 询问网站地址。
          </p>
        </div>
        <div>
          <strong>④ 后续使用</strong>
          <p>AI 直接调用 <code>travelctl visits prepare</code> 或 <code>travelctl destinations prepare</code>，预览后由用户确认导入；有配图时可先上传。</p>
          <p className="muted-copy">本机配置：Windows <code>%APPDATA%\\travelctl\\config.json</code>；Linux/macOS 通常是 <code>~/.config/travelctl/config.json</code>。当前为本地凭据文件，不是系统加密钥匙串，请勿分享或提交。</p>
        </div>
      </div>
    </section>
  );
}
