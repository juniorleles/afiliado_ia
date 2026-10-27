import type { CopyRewriteProposal } from "@/lib/presell-quality/copy-validate";
import { validateCopyRewrite } from "@/lib/presell-quality/copy-validate";

export type AcceptedFactRef = {
  field: string;
  factId: string;
  value: string;
};

export function proposeDeterministicRewrites(facts: AcceptedFactRef[]): CopyRewriteProposal[] {
  const out: CopyRewriteProposal[] = [];
  const description = facts.find((item) => item.field === "description");
  const how = facts.find((item) => item.field === "howItWorks");
  const guarantee = facts.find((item) => item.field === "guarantee");
  const ingredients = facts.find((item) => item.field === "ingredients");

  if (description) {
    const proposed = description.value.replace(
      /^Sugar Defender is presented by the seller as/,
      "The seller presents Sugar Defender as",
    );
    out.push(
      validateCopyRewrite({
        field: "description",
        factId: description.factId,
        original: description.value,
        proposed,
        section: "hero",
      }),
    );
  }
  if (how) {
    const proposed = how.value.replace("or prefer another method", "or you prefer another method");
    out.push(
      validateCopyRewrite({
        field: "howItWorks",
        factId: how.factId,
        original: how.value,
        proposed,
        section: "how_it_works",
      }),
    );
  }
  if (guarantee) {
    const proposed = /seller/i.test(guarantee.value)
      ? guarantee.value
      : `The seller states: ${guarantee.value}`;
    out.push(
      validateCopyRewrite({
        field: "guarantee",
        factId: guarantee.factId,
        original: guarantee.value,
        proposed,
        section: "guarantee",
      }),
    );
  }
  if (ingredients) {
    out.push(
      validateCopyRewrite({
        field: "ingredients",
        factId: ingredients.factId,
        original: ingredients.value,
        proposed: ingredients.value,
        section: "specifications",
      }),
    );
  }
  return out;
}

export function splitUsageSteps(text: string): string[] {
  const cleaned = text.replace("or prefer another method", "or you prefer another method").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(.*?maximize absorption\.)\s*(If the taste.*)$/i);
  if (match?.[1] && match[2]) return [match[1].trim(), match[2].trim()];
  const parts = cleaned.split(/(?<=\.)\s+(?=If )/);
  return parts.length >= 2 ? parts.map((item) => item.trim()) : [cleaned];
}

export function informationalDisclosureLine(): string {
  return "This page is an informational presentation. I may earn a commission if you purchase through links on this page.";
}

export async function proposeAiCopyRewrites(
  input: { facts: AcceptedFactRef[]; constraints: string[] },
  deps: {
    env?: NodeJS.ProcessEnv;
    complete?: (payload: { system: string; userText: string }) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;
  } = {},
): Promise<{ proposals: CopyRewriteProposal[]; inputTokens: number; outputTokens: number; estimatedUsd: number }> {
  const { envLookup, OPENAI_RESPONSES_URL } = await import("@/lib/lp-generator/ai-copy/config");
  const { extractOpenAiResponseText } = await import("@/lib/lp-generator/ai-copy/provider");
  const { paidProviderAllowed } = await import("@/lib/ai/paid-gate");
  const { providerFetch } = await import("@/lib/ai/resilience");
  const { estimateOpenAiVisionUsd, OPENAI_VISION_MODEL, OPENAI_VISION_PROVIDER_ID, OPENAI_VISION_TIMEOUT_MS } = await import("@/lib/presell-quality/openai-provider");
  const env = deps.env ?? process.env;
  const paid = paidProviderAllowed(OPENAI_VISION_PROVIDER_ID, env);
  if (!paid.allowed) throw new Error(paid.reason);
  const system = `You rewrite accepted affiliate-presell facts for clarity only.
Rules:
1. Keep every number, quantity, condition, and ingredient name.
2. Do not invent benefits, testimonials, prices, manufacturers, or medical claims.
3. Do not turn usage into a mechanism of action.
4. Keep seller attribution for seller-stated facts.
5. Return JSON { "rewrites": [{ "field": string, "proposed": string }] }.`;
  const userText = `FACTS=${JSON.stringify(input.facts)}\nCONSTRAINTS=${JSON.stringify(input.constraints)}`;
  const complete =
    deps.complete ??
    (async (payload) => {
      const apiKey = envLookup("OPENAI_API_KEY", env);
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
      const response = await providerFetch(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: OPENAI_VISION_MODEL,
            instructions: payload.system,
            input: [{ role: "user", content: [{ type: "input_text", text: payload.userText }] }],
            max_output_tokens: 800,
            text: { format: { type: "json_object" } },
          }),
        },
        { provider: OPENAI_VISION_PROVIDER_ID, model: OPENAI_VISION_MODEL, promptId: "presell-copy-rewrite", timeoutMs: OPENAI_VISION_TIMEOUT_MS, maxAttempts: 1 },
      );
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = (await response.json()) as { output?: Array<{ content?: Array<{ text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = extractOpenAiResponseText(data);
      if (!text) throw new Error("OpenAI response had no text block.");
      return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    });
  const completion = await complete({ system, userText });
  let parsed: { rewrites?: Array<{ field?: string; proposed?: string }> } = {};
  try {
    parsed = JSON.parse(completion.text) as typeof parsed;
  } catch {
    parsed = {};
  }
  const proposals = (parsed.rewrites ?? []).flatMap((row) => {
    const fact = input.facts.find((item) => item.field === row.field);
    if (!fact || typeof row.proposed !== "string") return [];
    return [
      validateCopyRewrite({
        field: fact.field,
        factId: fact.factId,
        original: fact.value,
        proposed: row.proposed,
        section: fact.field,
      }),
    ];
  });
  return {
    proposals,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedUsd: Number(estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens).toFixed(6)),
  };
}
