import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticateApi } from "@/lib/api-auth";
import { prepareImport } from "@/lib/import-service";

export const runtime = "nodejs";
const MAX_IMPORT_JSON_BYTES = 512 * 1024;
export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "expected application/json" }, { status: 415 });
  }
  // Authenticate before reading the request body to avoid unauthenticated parsing work.
  const identity = await authenticateApi(request);
  if (!identity) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader !== null) {
    const declared = Number(declaredHeader);
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_IMPORT_JSON_BYTES) {
      return NextResponse.json({ error: "batch too large" }, { status: 413 });
    }
  }
  if (!request.body) return NextResponse.json({ error: "missing body" }, { status: 400 });
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMPORT_JSON_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: "batch too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks).toString("utf8");
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const kind = raw && typeof raw === "object" && "kind" in raw ? raw.kind : null;
  const scope = kind === "visits" || kind === "visits-update" || kind === "timeline" ? "visits:write"
    : kind === "destinations" || kind === "destinations-update" ? "destinations:write" : null;
  if (!scope) return NextResponse.json({ error: "kind must be visits, destinations, visits-update, destinations-update or timeline" }, { status: 400 });
  if (!identity.scopes.includes(scope)) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  try {
    return NextResponse.json(await prepareImport(raw, identity.userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof ZodError ? error.issues.slice(0, 5).map(x => x.path.join(".") + ": " + x.message).join("; ")
      : error instanceof Error ? error.message : "unable to prepare import";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
