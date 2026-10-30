import { sha256Text } from "@/lib/presell-quality/fingerprint";

export type VisionRequestObservability = {
  model: string;
  maxOutputTokens: number;
  textFormat: "json_object" | "json_schema";
  temperatureSent: false;
  topPSent: false;
  seedSent: false;
  requestPayloadHash: string;
  imageLabels: string[];
};

export function redactVisionRequestForHash(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redactVisionRequestForHash);
  if (!body || typeof body !== "object") return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if ((key === "image_url" || key === "data") && typeof value === "string" && value.length > 80) {
      out[key] = `omitted:${value.length}`;
      continue;
    }
    out[key] = redactVisionRequestForHash(value);
  }
  return out;
}

export function hashVisionRequestPayload(body: unknown): string {
  return sha256Text(JSON.stringify(redactVisionRequestForHash(body)));
}

export function hashVisionResponsePayload(text: string): string {
  return sha256Text(text);
}
