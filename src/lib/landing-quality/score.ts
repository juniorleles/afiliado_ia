import type { LandingDocument } from "@/lib/landing-composer/types";
import type { LandingQualityScore, QualityProblem } from "@/lib/landing-quality/types";
import { text } from "@/lib/landing-quality/text";
import type { SectionGeneration } from "@/lib/section-generation/types";

export const QUALITY_MARK = 90;

const REQUIRED = ["hero", "cta", "footer"] as const;

function averagePercent(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 100);
}

export function seoScore(seo: Record<string, unknown> | null): number {
  if (!seo) return 0;
  let score = 0;
  if (text(seo.title)) score += 20;
  if (text(seo.metaDescription)) score += 25;
  if (text(seo.slug)) score += 15;
  const graph = seo.openGraph;
  if (graph && typeof graph === "object") {
    const row = graph as Record<string, unknown>;
    if (text(row.title)) score += 10;
    if (text(row.description)) score += 10;
  }
  if (Array.isArray(seo.keywords)) score += 10;
  if (seo.canonical == null) score += 10;
  else if (typeof seo.canonical === "string" && /^https?:\/\//i.test(seo.canonical)) score += 10;
  return score;
}

export function trustScore(document: LandingDocument, problems: QualityProblem[]): number {
  const codes = new Set(problems.map((problem) => problem.code));
  const present = (id: string) => document.sections.some((section) => section.sectionId === id);
  const graph = document.seo?.openGraph;
  const graphTitle = graph && typeof graph === "object" ? text((graph as Record<string, unknown>).title) : "";
  const flags = [
    present("hero"),
    present("cta"),
    present("footer"),
    document.seo != null,
    text(document.seo?.metaDescription).length > 0,
    !codes.has("h1"),
    !codes.has("prohibited-claim") && !codes.has("unsupported-claim"),
    !codes.has("unknown-ingredient") && !codes.has("unknown-guarantee"),
    !codes.has("broken-link") && !codes.has("schema") && !codes.has("jsonld"),
    !codes.has("faq") && !codes.has("open-graph") && graphTitle.length > 0,
  ];
  return Math.round((100 * flags.filter(Boolean).length) / flags.length);
}

export function landingScore(
  document: LandingDocument,
  sections: SectionGeneration[],
  problems: QualityProblem[],
): LandingQualityScore {
  const deliveredIds = new Set([
    ...document.sections.map((section) => section.sectionId),
    ...(document.seo ? ["seo"] : []),
    ...(document.schema ? ["schema"] : []),
  ]);
  const delivered = sections.filter((section) => deliveredIds.has(section.sectionId) && section.status === "GENERATED");
  const missing = REQUIRED.filter((id) => !document.sections.some((section) => section.sectionId === id)).length;
  const zeros = Array.from({ length: missing }, () => 0);
  const values = (pick: (section: SectionGeneration) => number) => [...delivered.map(pick), ...zeros];
  const copy = averagePercent(values((section) => section.scores?.copyScore ?? 0));
  const evidence = averagePercent(values((section) => section.scores?.evidenceScore ?? 0));
  const persuasion = averagePercent(values((section) => section.scores?.persuasionScore ?? 0));
  const readability = averagePercent(values((section) => section.scores?.readability ?? 0));
  const complianceValues = values((section) => section.scores?.complianceScore ?? 0);
  const compliance = complianceValues.length === 0 ? 0 : Math.round(Math.min(...complianceValues) * 100);
  const seo = seoScore(document.seo);
  const trust = trustScore(document, problems);
  const overall = Math.round((copy + seo + evidence + compliance + persuasion + readability) / 6);
  return { copy, seo, evidence, compliance, persuasion, readability, trust, overall };
}
