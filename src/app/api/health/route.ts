import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    return NextResponse.json(
      { status: "ok", database: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    logEvent("ERROR", "DATABASE", "health check failed");
    return NextResponse.json({ status: "error", database: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
