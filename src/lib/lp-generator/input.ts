import { createHash } from "node:crypto";
import { inspectPublicHttpsUrl, stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import type { CommercialGoal, GenerationInput } from "@/lib/lp-generator/types";

const GOALS = new Set<CommercialGoal>(["INFORM", "SEND_TO_OFFER", "SEND_TO_DETAILS"]);

export type InputIssue = { field: string; message: string };

export type NormalizedInput = {
  input: GenerationInput;
  hop: { href: string | null; previewOnly: boolean; placeholderRejected: boolean };
  issues: InputIssue[];
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionalUrl(raw: string, field: string, issues: InputIssue[]): string | undefined {
  if (!raw) return undefined;
  const stripped = stripUnverifiedHop(raw);
  const safe = inspectPublicHttpsUrl(stripped.href);
  if (!safe.ok) {
    issues.push({ field, message: safe.reason });
    return undefined;
  }
  return safe.url.toString();
}

export function normalizeGenerationInput(raw: {
  productName?: unknown;
  category?: unknown;
  salesUrl?: unknown;
  affiliateUrl?: unknown;
  hopLink?: unknown;
  language?: unknown;
  market?: unknown;
  goal?: unknown;
}): NormalizedInput {
  const issues: InputIssue[] = [];
  const productName = clean(raw.productName);
  if (productName.length < 2 || productName.length > 80) {
    issues.push({ field: "productName", message: "Informe o nome do produto (2 a 80 caracteres)." });
  }

  const category = clean(raw.category);
  const salesRaw = clean(raw.salesUrl);
  const salesUrl = optionalUrl(salesRaw, "salesUrl", issues);
  if (!salesRaw) issues.push({ field: "salesUrl", message: "A URL da página de vendas é obrigatória." });

  const affiliateUrl = optionalUrl(clean(raw.affiliateUrl), "affiliateUrl", issues);

  const hopRaw = clean(raw.hopLink);
  let hopHref: string | null = null;
  let placeholderRejected = false;
  let previewOnly = true;
  if (hopRaw) {
    const stripped = stripUnverifiedHop(hopRaw);
    if (stripped.hopPlaceholder) {
      placeholderRejected = true;
      issues.push({
        field: "hopLink",
        message: "O parâmetro hop informado é um placeholder e não é um HopLink válido. O preview será gerado sem CTA de compra.",
      });
    } else {
      const safe = inspectPublicHttpsUrl(stripped.href);
      if (!safe.ok) {
        issues.push({ field: "hopLink", message: safe.reason });
      } else {
        hopHref = safe.url.toString();
      }
    }
  }

  const language = clean(raw.language) || "en";
  const market = clean(raw.market) || "US";
  const goalRaw = clean(raw.goal).toUpperCase().replace(/[-\s]/g, "_");
  const goal: CommercialGoal = GOALS.has(goalRaw as CommercialGoal) ? (goalRaw as CommercialGoal) : "INFORM";
  if (goalRaw && !GOALS.has(goalRaw as CommercialGoal)) {
    issues.push({ field: "goal", message: "Objetivo comercial inválido. Use INFORM, SEND_TO_OFFER ou SEND_TO_DETAILS." });
  }

  if (goal !== "INFORM" && hopHref) previewOnly = false;
  else previewOnly = true;

  return {
    input: {
      productName,
      ...(category ? { category } : {}),
      salesUrl: salesUrl ?? salesRaw,
      ...(affiliateUrl ? { affiliateUrl } : {}),
      ...(hopHref ? { hopLink: hopHref } : {}),
      language,
      market,
      goal,
    },
    hop: { href: hopHref, previewOnly, placeholderRejected },
    issues,
  };
}

export function inputIsReady(normalized: NormalizedInput): boolean {
  const blockers = normalized.issues.filter(
    (item) => !(item.field === "hopLink" && normalized.hop.placeholderRejected),
  );
  return (
    blockers.length === 0 &&
    normalized.input.productName.length >= 2 &&
    inspectPublicHttpsUrl(normalized.input.salesUrl).ok
  );
}

export function generationHash(input: GenerationInput): string {
  const canonical = {
    productName: input.productName.toLowerCase(),
    category: (input.category ?? "").toLowerCase(),
    salesUrl: input.salesUrl,
    affiliateUrl: input.affiliateUrl ?? "",
    hopLink: input.hopLink ?? "",
    language: input.language.toLowerCase(),
    market: input.market.toUpperCase(),
    goal: input.goal,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24);
}
