import { NextResponse } from "next/server";
import {
  decryptInsEnvelope,
  getClickBankInsSecret,
  MAX_INS_BODY_BYTES,
  parseInsEnvelope,
  parseInsTransaction,
} from "@/lib/clickbank";
import { ingestParsedTransaction } from "@/lib/clickbank-store";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function empty(status: number) {
  return new NextResponse(status === 200 ? "OK" : "rejected", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const received = new Date().toISOString();
  const secret = getClickBankInsSecret();
  if (!secret) {
    logEvent("ERROR", "CLICKBANK_INS", "secret missing", { received, verified: false, result: "unconfigured" });
    return empty(503);
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    logEvent("WARN", "CLICKBANK_INS", "body unread", { received, verified: false, result: "bad_body" });
    return empty(400);
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_INS_BODY_BYTES) {
    logEvent("WARN", "CLICKBANK_INS", "payload too large", { received, verified: false, result: "too_large" });
    return empty(413);
  }

  const envelope = parseInsEnvelope(raw, request.headers.get("content-type"));
  if (!envelope) {
    logEvent("WARN", "CLICKBANK_INS", "malformed envelope", { received, verified: false, result: "malformed" });
    return empty(400);
  }

  let payload: unknown;
  try {
    payload = decryptInsEnvelope(envelope, secret);
  } catch {
    logEvent("WARN", "CLICKBANK_INS", "verification failed", { received, verified: false, result: "unauthenticated" });
    return empty(400);
  }

  const parsed = parseInsTransaction(payload);
  if ("error" in parsed) {
    logEvent("WARN", "CLICKBANK_INS", "payload rejected", { received, verified: true, result: parsed.error });
    return empty(400);
  }

  const result = ingestParsedTransaction(parsed);
  logEvent("INFO", "CLICKBANK_INS", "processed", {
    received,
    verified: true,
    eventType: parsed.transactionType,
    transactionId: parsed.externalTransactionId,
    attributionStatus: result.attributionStatus,
    result: result.duplicate ? "duplicate" : result.stored ? "stored" : result.error || "failed",
  });
  if (result.duplicate) return empty(200);
  if (result.error === "unknown_transaction_type") return empty(400);
  if (!result.stored) return empty(500);
  return empty(200);
}

export async function GET() {
  return new NextResponse("ClickBank INS endpoint", {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  });
}
