import { readFileSync } from "node:fs";
import path from "node:path";
import { providerFetch } from "@/lib/ai/resilience";

export type ConceptImageRequest = {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  outputFormat: string;
  idempotencyKey: string;
  operation: "generations" | "edits";
  referenceImagePath?: string;
};

export type ImageProvider = {
  create(input: ConceptImageRequest): Promise<Buffer>;
};

type ImageResponse = { data?: Array<{ b64_json?: string }> };

function sanitizeImageError(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; type?: string; code?: string } };
    detail = [parsed.error?.type, parsed.error?.code, parsed.error?.message].filter(Boolean).join(": ");
  } catch {
    detail = body.replace(/\s+/g, " ").trim();
  }
  detail = detail.replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return `image request failed with status ${status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

/**
 * Documented Images API:
 * POST /v1/images/generations and POST /v1/images/edits
 * https://developers.openai.com/api/docs/guides/image-generation
 * The client is constructed only when a generation is explicitly executed.
 */
export function createOpenAiImageProvider(fetchImpl: typeof fetch = fetch): ImageProvider {
  return {
    async create(input) {
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) {
        throw new Error("BLOCKED_MISSING_API_KEY");
      }
      const endpoint =
        input.operation === "edits"
          ? "https://api.openai.com/v1/images/edits"
          : "https://api.openai.com/v1/images/generations";
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Idempotency-Key": input.idempotencyKey,
      };
      let body: BodyInit;
      if (input.operation === "edits") {
        if (!input.referenceImagePath) throw new Error("edit requested without a reference image");
        const bytes = readFileSync(input.referenceImagePath);
        const form = new FormData();
        form.set("model", input.model);
        form.set("prompt", input.prompt);
        form.set("n", "1");
        form.set("size", input.size);
        form.set("quality", input.quality);
        form.set("output_format", input.outputFormat);
        form.append(
          "image[]",
          new Blob([bytes], { type: "image/png" }),
          path.basename(input.referenceImagePath),
        );
        body = form;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          n: 1,
          size: input.size,
          quality: input.quality,
          output_format: input.outputFormat,
        });
      }
      const response = await providerFetch(
        endpoint,
        { method: "POST", headers, body },
        { provider: "openai", model: input.model, promptId: "visual-concept-image", fetchImpl },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(sanitizeImageError(response.status, detail));
      }
      const payload = (await response.json()) as ImageResponse;
      const encoded = payload.data?.[0]?.b64_json;
      if (!encoded) throw new Error("image response missing b64_json");
      return Buffer.from(encoded, "base64");
    },
  };
}
