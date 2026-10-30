#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, rm, chmod } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { stdin, stdout } from "node:process";

type Credential = { provider: "windows-dpapi" | "file"; value: string };
type StoredConfig = { server: string; credential?: Credential; token?: string };
type Session = { server: string; token: string };
type ApiOptions = { method?: string; data?: unknown; form?: FormData };

const configDir = process.platform === "win32"
  ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "travelctl")
  : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "travelctl");
const configFile = join(configDir, "config.json");

function usage() {
  console.log(`travelctl — AI-assisted travel import CLI

First-time setup:
  travelctl auth login
  travelctl auth login --server https://travel.example.com
  travelctl auth status
  travelctl auth logout

Read:
  travelctl visits list
  travelctl destinations list
  travelctl timeline list

Create (preview, then confirm):
  travelctl visits prepare ./visits.json
  travelctl destinations prepare ./future.json

Update existing records (preview, then confirm):
  travelctl visits update prepare ./visit-updates.json
  travelctl destinations update prepare ./destination-updates.json
  travelctl timeline prepare ./timeline-changes.json

Commit or cancel a reviewed draft:
  travelctl import commit <draft-id> --confirm
  travelctl import cancel <draft-id>

Images (JPEG, PNG or WebP; max 8 MiB):
  travelctl media upload ./photo.jpg

Update JSON records must include their existing id. Timeline events can be created
without id (include year/date/group/title/placeIds) or updated with an existing id.
All write operations create a preview draft; no database change occurs before commit.
`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function runPowerShell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script,
    ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; if (output.length > 16_384) child.kill(); });
    child.once("error", () => reject(new Error("Windows DPAPI 不可用，未保存授权令牌")));
    child.once("close", code => {
      if (code !== 0) reject(new Error("Windows DPAPI 凭据操作失败，未保存授权令牌"));
      else resolve(output.trimEnd());
    });
    child.stdin.end(input, "utf8");
  });
}

async function protectToken(token: string): Promise<Credential> {
  if (process.platform !== "win32") return { provider: "file", value: token };
  const script = "$ErrorActionPreference='Stop'; $plain=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $plain -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure))";
  const value = await runPowerShell(script, token);
  if (!value) fail("Windows DPAPI 返回了空凭据，未保存授权令牌");
  return { provider: "windows-dpapi", value };
}

async function unprotectToken(credential: Credential): Promise<string> {
  if (credential.provider === "file") return credential.value;
  if (credential.provider !== "windows-dpapi" || process.platform !== "win32") {
    fail("该授权凭据由另一平台或 Windows 用户保护；请在本机重新执行 travelctl auth login");
  }
  const script = "$ErrorActionPreference='Stop'; $encrypted=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $encrypted; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }";
  return runPowerShell(script, credential.value);
}

async function saveConfig(server: string, token: string): Promise<void> {
  const credential = await protectToken(token);
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const tempFile = configFile + "." + process.pid + ".tmp";
  await writeFile(tempFile, JSON.stringify({ server, credential }), { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(tempFile, 0o600);
  await rename(tempFile, configFile);
}

async function readConfig(): Promise<Session> {
  let stored: StoredConfig;
  try {
    stored = JSON.parse(await readFile(configFile, "utf8")) as StoredConfig;
  } catch {
    fail("尚未授权；请在自己的终端运行 travelctl auth login");
  }
  if (!stored.server) fail("本地配置缺少网站地址，请重新执行 travelctl auth login");
  if (stored.credential?.value) {
    return { server: stored.server, token: await unprotectToken(stored.credential) };
  }
  // Migrate the previous plaintext config once, protecting it with Windows DPAPI.
  if (typeof stored.token === "string" && stored.token) {
    const session = { server: stored.server, token: stored.token };
    if (process.platform === "win32") await saveConfig(session.server, session.token);
    return session;
  }
  fail("本地凭据无效；请重新执行 travelctl auth login");
}

async function askTerminal(label: string, hidden = false, maxLength = 512): Promise<string> {
  const terminal = stdin as typeof stdin & { setRawMode?: (mode: boolean) => void; isRaw?: boolean };
  if (!terminal.isTTY || !terminal.setRawMode) {
    fail("首次授权需要在本机交互式终端完成；不要把 Token 放进命令参数或 AI 对话");
  }
  stdout.write(label);
  let result = "";
  const oldRaw = terminal.isRaw ?? false;
  terminal.setRawMode(true);
  terminal.resume();
  return new Promise((resolve, reject) => {
    const listener = (data: Buffer | string) => {
      for (const character of data.toString("utf8")) {
        if (character === "\u0003") { cleanup(); reject(new Error("已取消")); return; }
        if (character === "\r" || character === "\n") { cleanup(); resolve(result); return; }
        if (character === "\u007f" || character === "\b") {
          if (result) {
            result = result.slice(0, -1);
            if (!hidden) stdout.write("\b \b");
          }
        } else if (character >= " " && result.length < maxLength) {
          result += character;
          if (!hidden) stdout.write(character);
        }
      }
    };
    function cleanup() {
      terminal.off("data", listener);
      terminal.setRawMode?.(oldRaw);
      terminal.pause();
      stdout.write("\n");
    }
    terminal.on("data", listener);
  });
}

function getFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}

async function api(path: string, options: ApiOptions = {}, session?: Session): Promise<Record<string, unknown>> {
  const auth = session ?? await readConfig();
  if (!auth.server || !auth.token) fail("尚未授权，请先运行 travelctl auth login");
  const headers: Record<string, string> = { Authorization: `Bearer ${auth.token}` };
  if (options.data !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(new URL(path, auth.server).toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.form ?? (options.data === undefined ? undefined : JSON.stringify(options.data)),
      signal: AbortSignal.timeout(25_000),
      redirect: "error",
    });
  } catch (cause) {
    fail(`请求失败：${cause instanceof Error ? cause.message : "网络错误"}`);
  }
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result
      ? String(result.error) : "request failed";
    fail(`HTTP ${response.status}: ${message.replaceAll(auth.token, "[redacted]")}`);
  }
  return result as Record<string, unknown>;
}

function output(result: unknown): void {
  console.log(JSON.stringify(result, null, 2));
}

async function prepare(kind: string, filePath: string): Promise<void> {
  if (!filePath) fail("请提供 JSON 文件路径");
  const raw: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!raw || typeof raw !== "object") fail("JSON 必须是对象或数组");
  const items = Array.isArray(raw) ? raw : "items" in raw ? raw.items : null;
  if (!Array.isArray(items) || !items.length) fail("JSON items 必须是非空数组");
  const result = await api("/api/v1/imports/prepare", {
    method: "POST", data: { kind, items },
  });
  output(result);
  console.error(`请检查 before/current、changes 和 warnings。确认后执行：travelctl import commit ${String(result.draftId)} --confirm`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [topic, operation, argument, fourth] = args;
  if (!topic || ["help", "--help", "-h"].includes(topic)) { usage(); return; }

  if (topic === "auth" && operation === "login") {
    console.log("Travel Planner 首次授权（输入只在本机终端处理）。");
    const rawServer = getFlag(args, "--server")
      ?? (await askTerminal("Travel Planner 网站地址（https://...）：")).trim();
    let url: URL;
    try { url = new URL(rawServer); } catch { fail("网站地址无效，请包含 https://"); }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      fail("除 localhost 外必须使用 HTTPS");
    }
    if (url.username || url.password) fail("网站地址不能包含账号密码");
    const server = url.origin;
    const token = (await askTerminal("粘贴 AI 授权 Token（隐藏输入）：", true, 100)).trim();
    if (!/^trv_[A-Za-z0-9_-]{43}$/.test(token)) fail("Token 格式不正确");
    const profile = await api("/api/v1/me", {}, { server, token });
    await saveConfig(server, token);
    const user = profile.user && typeof profile.user === "object" && "username" in profile.user
      ? String(profile.user.username) : "已授权用户";
    console.log(`已连接 ${server}（${user}）。本地凭据已保存。`);
    if (process.platform === "win32") console.log("Windows 使用当前用户 DPAPI 加密 Token。");
    return;
  }

  if (topic === "auth" && operation === "status") {
    const session = await readConfig();
    const profile = await api("/api/v1/me", {}, session);
    output({ server: session.server, ...profile });
    return;
  }

  if (topic === "auth" && operation === "logout") {
    await rm(configFile, { force: true });
    console.log("本机 Travel Planner 授权配置已删除。");
    return;
  }

  if ((topic === "visits" || topic === "destinations") && operation === "list") {
    output(await api(topic === "visits" ? "/api/v1/visits" : "/api/v1/destinations"));
    return;
  }

  if (topic === "timeline" && operation === "list") {
    output(await api("/api/v1/timeline"));
    return;
  }

  if (topic === "media" && operation === "upload") {
    if (!argument) fail("请提供本地 JPEG/PNG/WebP 图片路径");
    const bytes = await readFile(argument);
    if (bytes.byteLength > 8 * 1024 * 1024) fail("图片超过 8 MiB");
    const type = /\.png$/i.test(argument) ? "image/png" : /\.webp$/i.test(argument) ? "image/webp" : "image/jpeg";
    const form = new FormData();
    form.append("image", new Blob([bytes], { type }), basename(argument));
    output(await api("/api/v1/media", { method: "POST", form }));
    return;
  }

  if ((topic === "visits" || topic === "destinations") && operation === "prepare") {
    await prepare(topic, argument ?? "");
    return;
  }

  if ((topic === "visits" || topic === "destinations") && operation === "update" && argument === "prepare") {
    await prepare(`${topic}-update`, fourth ?? "");
    return;
  }

  if (topic === "timeline" && operation === "prepare") {
    await prepare("timeline", argument ?? "");
    return;
  }

  if (topic === "import" && operation === "commit") {
    if (!argument) fail("缺少草稿 ID");
    if (!args.includes("--confirm")) fail("只有在用户明确确认预览后才能使用 --confirm");
    output(await api(`/api/v1/imports/${encodeURIComponent(argument)}/commit`, { method: "POST" }));
    return;
  }

  if (topic === "import" && operation === "cancel") {
    if (!argument) fail("缺少草稿 ID");
    output(await api(`/api/v1/imports/${encodeURIComponent(argument)}/cancel`, { method: "POST" }));
    return;
  }

  usage();
  fail("未知命令");
}

main().catch(error => {
  console.error(`travelctl: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
