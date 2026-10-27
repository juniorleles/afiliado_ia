import type { ProductFacts } from "@/lib/product-facts";
import type { ConflictRecord, EnrichmentSource } from "@/lib/product-enrichment/types";
import { classifyEvidence } from "@/lib/presell-enrichment/classify";
import { extractPresellItems } from "@/lib/presell-enrichment/extract";
import type {
  EvidenceRegistry,
  EvidenceRegistryEntry,
  ExtractedPresellItem,
  PresellSemanticField,
} from "@/lib/presell-enrichment/types";
import { PRESELL_ENRICHMENT_VERSION } from "@/lib/presell-enrichment/types";
import { classifySubmittedUrl } from "@/lib/campaign-sources/classify";
import { classifySourceClass } from "@/lib/research-coverage/classify-source";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function fromFacts(facts: ProductFacts): ExtractedPresellItem[] {
  const url = facts.sourceUrl || "";
  const at = null;
  const rows: ExtractedPresellItem[] = [];
  const push = (field: PresellSemanticField, text: string, extra?: Partial<ExtractedPresellItem>) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    rows.push({
      field,
      text: clean,
      url,
      collectedAt: at,
      evidenceType: "EXISTING_FACT",
      ...extra,
    });
  };
  if (facts.description) push("PRODUCT_OVERVIEW", facts.description);
  for (const item of facts.features ?? []) push("FEATURES", item);
  for (const item of facts.ingredientsOrComponents ?? []) push("INGREDIENTS", item);
  for (const spec of facts.specifications ?? []) {
    push("SPECIFICATIONS", `${spec.name}: ${spec.value}`, { name: spec.name, value: spec.value, unit: spec.unit });
  }
  for (const item of facts.usageInformation ?? []) push("HOW_TO_USE", item);
  for (const item of facts.cautions ?? []) push("CAUTIONS", item);
  if (facts.guaranteeInformation) push("WARRANTY_OR_GUARANTEE", facts.guaranteeInformation);
  for (const snippet of facts.sourceSnippets ?? []) {
    if (snippet.field === "faq" && snippet.question) {
      push("FAQ", snippet.text, { question: snippet.question, url: snippet.sourceUrl || url });
    }
  }
  return rows;
}

export function buildEvidenceRegistry(input: {
  sources: EnrichmentSource[];
  facts?: ProductFacts;
  withheld?: Array<{ field: string; text: string; reason: string }>;
  conflicts?: ConflictRecord[];
}): EvidenceRegistry {
  const extracted = [
    ...(input.facts ? fromFacts(input.facts) : []),
    ...input.sources.flatMap((source) => extractPresellItems(source)),
  ];

  const entries: EvidenceRegistryEntry[] = [];
  const seen = new Set<string>();
  for (const item of extracted) {
    const classified = classifyEvidence({ field: item.field, text: item.text });
    const purpose = item.url ? classifySubmittedUrl(item.url) : null;
    const sourceClass = item.url ? classifySourceClass({ url: item.url }).sourceClass : null;
    const idKey = `${item.field}|${keyOf(item.question ?? "")}|${keyOf(item.text)}`;
    if (seen.has(idKey)) {
      const existing = entries.find(
        (entry) => entry.field === item.field && keyOf(entry.originalText) === keyOf(item.text) && keyOf(entry.question ?? "") === keyOf(item.question ?? ""),
      );
      if (existing && !existing.url && item.url) {
        existing.url = item.url;
        existing.collectedAt = item.collectedAt ?? existing.collectedAt;
        existing.sourceType = purpose?.sourceType ?? existing.sourceType;
        existing.sourceClassification = sourceClass ?? existing.sourceClassification;
      }
      continue;
    }
    seen.add(idKey);
    entries.push({
      id: `ev${entries.length + 1}`,
      field: item.field,
      originalText: item.text,
      source: item.evidenceType,
      url: item.url,
      collectedAt: item.collectedAt,
      evidenceType: item.evidenceType,
      extractionMode: item.extractionMode ?? "HTTP",
      verification: classified.verification,
      restriction: classified.restriction,
      sourceType: purpose?.sourceType,
      sourceClassification: sourceClass ?? undefined,
      question: item.question,
      name: item.name,
      value: item.value,
      unit: item.unit,
      notes: [
        ...(item.notes ?? []),
        ...classified.notes,
        item.extractionMode === "BROWSER_RENDERED" ? "Extraction mode: BROWSER_RENDERED" : "",
      ].filter(Boolean),
    });
  }

  for (const row of input.withheld ?? []) {
    entries.push({
      id: `ev${entries.length + 1}`,
      field: "SELLER_CLAIMS",
      originalText: row.text,
      source: "EXISTING_FACT",
      url: input.facts?.sourceUrl ?? "",
      collectedAt: null,
      evidenceType: "EXISTING_FACT",
      verification: "PROHIBITED",
      restriction: "BLOCKED",
      notes: [row.reason],
    });
  }

  const conflicts = (input.conflicts ?? []).map((row) => ({
    field: row.field,
    ids: entries.filter((item) => keyOf(item.originalText) && row.values.some((value) => keyOf(value.text) === keyOf(item.originalText))).map((item) => item.id),
    reason: row.reason,
  }));
  for (const conflict of conflicts) {
    for (const id of conflict.ids) {
      const entry = entries.find((item) => item.id === id);
      if (entry) {
        entry.verification = "CONFLICTING";
        entry.restriction = "INTERNAL_ONLY";
        entry.notes.push(conflict.reason);
      }
    }
  }

  return {
    version: PRESELL_ENRICHMENT_VERSION,
    entries,
    conflicts,
    blocked: entries.filter((item) => item.restriction === "BLOCKED").map((item) => item.id),
  };
}

export function publishableEntries(registry: EvidenceRegistry, field: PresellSemanticField): EvidenceRegistryEntry[] {
  return registry.entries.filter(
    (item) =>
      item.field === field &&
      item.restriction === "PUBLISHABLE" &&
      (item.verification === "SELLER_STATED" || item.verification === "VERIFIED_PRODUCT_FACT"),
  );
}
