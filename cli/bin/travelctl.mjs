#!/usr/bin/env node
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { stdin, stdout } from "node:process";

const configDir = process.platform === "win32"
  ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "travelctl")
  : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "travelctl");
const configFile = join(configDir, "config.json");

function usage() {
  console.log(`travelctl — AI-assisted travel import CLI

First-time setup:
  travelctl auth login
  # asks for website URL and API Token locally, then saves configuration
  # or skip the URL prompt:
  travelctl auth login --server https://travel.example.com
  travelctl auth status

Read:
  travelctl visits list
  travelctl destinations list

Import (requires user confirmation):
  travelctl visits prepare ./visits.json
  travelctl destinations prepare ./future.json
  travelctl import commit <draft-id> --confirm
  travelctl import cancel <draft-id>

Images (JPEG, PNG or WebP; max 8 MiB):
  travelctl media upload ./photo.jpg

JSON files for prepare contain an array of records or {"items":[...]}.
Run commands with --json for structured output where supported.
`);
}
function error(message) { console.error(`travelctl: ${message}`); process.exitCode = 1; }
async function readConfig() {
  try { return JSON.parse(await readFile(configFile, "utf8")); }
  catch { throw new Error("not configured; run travelctl auth login in your own terminal to set up your website and API Token"); }
}
async function askTerminal(label, { hidden = false, maxLength = 512 } = {}) {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error("first-time login requires an interactive local terminal; never pass a token as a command argument or paste it into an AI conversation");
  }
  stdout.write(label);
  let result = "";
  const oldRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    const listener = data => {
      for (const character of data.toString("utf8")) {
        if (character === "\u0003") { cleanup(); reject(new Error("canceled")); return; }
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
      stdin.off("data", listener);
      stdin.setRawMode(oldRaw);
      stdin.pause();
      stdout.write("\n");
    }
    stdin.on("data", listener);
  });
}
async function saveConfig(server, token) {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configFile, JSON.stringify({ server, token }), { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(configFile, 0o600);
}
function getFlag(args, name) {
  const n = args.indexOf(name);
  return n === -1 ? null : args[n + 1];
}
async function api(path, { method = "GET", data, form } = {}, config = null) {
  const session = config ?? await readConfig();
  const server = session.server;
  if (!server || !session.token) throw new Error("not authenticated");
  const headers = { Authorization: `Bearer ${session.token}` };
  if (data !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(new URL(path, server).toString(), {
      method, headers, body: form ?? (data === undefined ? undefined : JSON.stringify(data)),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    });
  } catch (cause) { throw new Error(`request failed: ${cause.message}`); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error ?? "request failed"}`);
  return result;
}
function output(result) { console.log(JSON.stringify(result, null, 2)); }

async function main() {
  const args = process.argv.slice(2);
  const [topic, operation, arg] = args;
  if (!topic || ["help", "--help", "-h"].includes(topic)) return usage();
  if (topic === "auth" && operation === "login") {
    console.log("Travel Planner first-time setup (all input stays in your local terminal).");
    const rawServer = getFlag(args, "--server")
      || (await askTerminal("Your Travel Planner website URL (https://...): ")).trim();
    let url;
    try { url = new URL(rawServer); }
    catch { throw new Error("invalid website address; include https:// and your actual site domain"); }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("HTTPS is required except on localhost");
    }
    if (url.username || url.password) throw new Error("website URL must not contain credentials");
    const server = url.origin;
    const token = (await askTerminal("Paste the API Token from site settings (hidden): ", { hidden: true, maxLength: 100 })).trim();
    if (!/^trv_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("invalid token format");
    const profile = await api("/api/v1/me", {}, { server, token });
    await saveConfig(server, token);
    console.log(`Connected to ${server} as ${profile.user.username}. Configuration saved in ${configFile}`);
    return;
  }
  if (topic === "auth" && operation === "status") {
    const config = await readConfig();
    output({ server: config.server, ...(await api("/api/v1/me")) });
    return;
  }
  if ((topic === "visits" || topic === "destinations") && operation === "list") {
    return output(await api(topic === "visits" ? "/api/v1/visits" : "/api/v1/destinations"));
  }
  if (topic === "media" && operation === "upload") {
    if (!arg) throw new Error("provide a local JPEG/PNG/WebP image filename");
    const bytes = await readFile(arg);
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("image is larger than 8 MiB");
    const type = /\.png$/i.test(arg) ? "image/png" : /\.webp$/i.test(arg) ? "image/webp" : "image/jpeg";
    const form = new FormData();
    form.append("image", new Blob([bytes], { type }), basename(arg));
    return output(await api("/api/v1/media", { method: "POST", form }));
  }
  if ((topic === "visits" || topic === "destinations") && operation === "prepare") {
    if (!arg) throw new Error("provide a JSON file path");
    const raw = JSON.parse(await readFile(arg, "utf8"));
    const items = Array.isArray(raw) ? raw : raw.items;
    const prepared = await api("/api/v1/imports/prepare", { method: "POST", data: { kind: topic, items } });
    output(prepared);
    console.error(`Review this preview carefully. To confirm: travelctl import commit ${prepared.draftId} --confirm`);
    return;
  }
  if (topic === "import" && operation === "commit") {
    if (!arg) throw new Error("draft ID is required");
    if (!args.includes("--confirm")) throw new Error("explicit --confirm required after user has reviewed the preview");
    return output(await api(`/api/v1/imports/${encodeURIComponent(arg)}/commit`, { method: "POST" }));
  }
  if (topic === "import" && operation === "cancel") {
    if (!arg) throw new Error("draft ID is required");
    return output(await api(`/api/v1/imports/${encodeURIComponent(arg)}/cancel`, { method: "POST" }));
  }
  usage();
  throw new Error("unknown command");
}

main().catch(e => error(e instanceof Error ? e.message : String(e)));
