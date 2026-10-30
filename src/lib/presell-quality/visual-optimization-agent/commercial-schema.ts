import type { CommercialCopyPlan, CommercialCopyState, CopyChange, FactBackedCopy, LayoutChange } from "./types.ts";
import { emptyCommercialCopyPlan } from "./commercial.ts";
import { parseVisualAnalysisPlan } from "./schema.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseFactCopy(value: unknown, fallback: FactBackedCopy): FactBackedCopy {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  const proposed = asString(row.proposed) || fallback.proposed;
  const current = asString(row.current) || fallback.current;
  const ids = asArray(row.supporting_fact_ids).map(asString).filter(Boolean);
  return {
    current,
    proposed,
    supporting_fact_ids: ids.length ? ids : fallback.supporting_fact_ids,
  };
}

export function parseCommercialCopyPlan(
  raw: string,
  current: CommercialCopyState,
): { ok: true; plan: CommercialCopyPlan } | { ok: false; reason: string } {
  const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const empty = emptyCommercialCopyPlan(current);
    const visual = parseVisualAnalysisPlan(
      JSON.stringify({
        visual_defects: [],
        layout_changes: parsed.visual_changes ?? parsed.layout_changes ?? [],
        copy_changes: parsed.section_changes ?? parsed.copy_changes ?? [],
        expected_improvements: parsed.conversion_improvements ?? [],
        content_safety_risks: parsed.compliance_risks ?? [],
      }),
    );
    const layout: LayoutChange[] = visual.ok ? visual.plan.layout_changes : [];
    const section: CopyChange[] = visual.ok ? visual.plan.copy_changes : [];
    const offers = asArray(parsed.offer_presentation)
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const op = asString(row.op);
        if (!op) return null;
        if (typeof row.value === "boolean") return { op, value: row.value };
        const text = asString(row.value);
        return text ? { op, value: text } : { op, value: true };
      })
      .filter((item): item is LayoutChange => Boolean(item));
    const headline = parseFactCopy(parsed.headline, empty.headline);
    const subheadline = parseFactCopy(parsed.subheadline, empty.subheadline);
    const copyChanges: CopyChange[] = [...section];
    if (headline.proposed && headline.proposed !== headline.current) {
      copyChanges.push({ op: "SET_HEADLINE", value: headline.proposed });
    }
    if (subheadline.proposed && subheadline.proposed !== subheadline.current) {
      copyChanges.push({ op: "SET_SUBHEADLINE", value: subheadline.proposed });
    }
    return {
      ok: true,
      plan: {
        headline,
        subheadline,
        section_changes: copyChanges,
        offer_presentation: offers,
        visual_changes: layout,
        conversion_improvements: asArray(parsed.conversion_improvements).map(asString).filter(Boolean),
        compliance_risks: asArray(parsed.compliance_risks).map(asString).filter(Boolean),
      },
    };
  } catch {
    return { ok: false, reason: "Commercial analysis response is not valid JSON." };
  }
}
