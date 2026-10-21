import { isCopyEligibleConfidence, type ProductFacts, type SpecificationFact } from "@/lib/product-facts";
import { statementFindings } from "@/lib/product-contract/claims";

/**
 * Specification normalization.
 *
 * Keeps only name/value pairs the source stated together and that are eligible copy. Two eligible
 * sources that give different values for one name are a conflict: the pair is dropped, never resolved
 * by choosing one. Nothing is inferred from another field.
 */

export type NormalizedSpecification = { name: string; value: string; unit?: string; fact: SpecificationFact };

export type SpecificationResult = {
  kept: NormalizedSpecification[];
  conflicts: Array<{ name: string; values: string[] }>;
  rejected: Array<{ text: string; categories: string[] }>;
};

const MAX_NAME = 60;
const MAX_VALUE = 120;

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numeric(value: string): string {
  const text = value.toLowerCase().replace(/\s+/g, "");
  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) return String(Number(text.replace(",", ".")));
  return text;
}

function unitKey(unit: string | undefined): string {
  const text = clean(unit).toLowerCase();
  return text.length > 3 ? text.replace(/s$/, "") : text;
}

function valueKey(item: { value: string; unit?: string }): string {
  return `${numeric(item.value)}|${unitKey(item.unit)}`;
}

export function specificationLabel(item: { name: string; value: string; unit?: string }): string {
  return `${item.name}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`;
}

export function normalizeSpecifications(facts: ProductFacts | null): SpecificationResult {
  const result: SpecificationResult = { kept: [], conflicts: [], rejected: [] };
  const eligible: NormalizedSpecification[] = [];
  for (const fact of facts?.specifications ?? []) {
    if (fact.copyEligibility !== "YES" || !isCopyEligibleConfidence(fact.provenance) || (fact.policyFindings ?? []).length > 0) continue;
    const name = clean(fact.name);
    const value = clean(fact.value);
    const unit = clean(fact.unit) || undefined;
    if (!name || !value) continue;
    if (name.length > MAX_NAME || value.length > MAX_VALUE) continue;
    const text = specificationLabel({ name, value, unit });
    // A value is shown as a fact, so a claim dressed as a value ("Sound: the best ever") is removed like any claim.
    const findings = statementFindings(text, "PROMOTIONAL");
    if (findings.length > 0) {
      result.rejected.push({ text, categories: findings.map((finding) => finding.category) });
      continue;
    }
    eligible.push({ name, value, ...(unit ? { unit } : {}), fact });
  }

  const groups = new Map<string, NormalizedSpecification[]>();
  for (const item of eligible) {
    const key = nameKey(item.name);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    const distinct = new Set(group.map(valueKey));
    if (distinct.size > 1) {
      result.conflicts.push({ name: group[0].name, values: group.map((item) => specificationLabel(item)) });
      continue;
    }
    result.kept.push(group[0]);
  }
  // Keep the order in which the source stated the kept pairs.
  const order = new Map(eligible.map((item, index) => [item, index]));
  result.kept.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return result;
}
