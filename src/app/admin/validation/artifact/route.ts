import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAdminApi } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const rel = new URL(request.url).searchParams.get("path")?.trim() || "";
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  const root = path.resolve(process.cwd(), "data", "validation-lab");
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(resolved);
  const type = resolved.endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": type,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
