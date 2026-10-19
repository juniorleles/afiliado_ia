import { composeLandingDocument } from "@/lib/landing-composer/compose";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { QUALITY_MARK } from "@/lib/landing-quality/score";
import { repairSection } from "@/lib/landing-quality/repair";
import type { AutoFixHistory, LandingQuality, QualityProblem } from "@/lib/landing-quality/types";
import { extractUrls, hostname } from "@/lib/landing-quality/text";
import { validateLanding } from "@/lib/landing-quality/validate";
import type { LandingBlueprint } from "@/lib/landing-blueprint/types";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { ProductFacts } from "@/lib/product-facts";
import type { SectionSources } from "@/lib/section-generation/run";
import { SECTION_IDS, type GeneratedSections, type SectionGeneration, type SectionId } from "@/lib/section-generation/types";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

export type QualityRunInput = {
  campaignId: number;
  document: LandingDocument;
  sections: GeneratedSections;
  facts: ProductFacts;
  analysis: MarketIntelligenceAnalysis | null;
  decision: StrategyDecision | null;
  blueprint: LandingBlueprint;
  now?: string;
};

function allowedHosts(facts: ProductFacts, analysis: MarketIntelligenceAnalysis | null, sections: SectionGeneration[]): Set<string> {
  const hosts = new Set<string>(["schema.org"]);
  const add = (value: string) => {
    const host = hostname(value);
    if (host) hosts.add(host);
    for (const url of extractUrls(value)) {
      const inner = hostname(url);
      if (inner) hosts.add(inner);
    }
  };
  add(facts.sourceUrl);
  if (facts.productImageUrl) add(facts.productImageUrl);
  for (const url of facts.imageUrls ?? []) add(url);
  for (const item of analysis?.competitorsRank ?? []) {
    const domain = item.domain.toLowerCase().replace(/^www\./, "").split("/")[0];
    if (domain) hosts.add(domain);
  }
  for (const section of sections) {
    for (const evidence of section.evidenceUsed ?? []) add(evidence.text);
  }
  return hosts;
}

const INTEGRITY = new Set([
  "hero-missing",
  "cta-missing",
  "footer-missing",
  "benefits-missing",
  "seo-missing",
  "meta-description",
  "h1",
  "faq",
  "prohibited-claim",
  "unsupported-claim",
  "unknown-ingredient",
  "unknown-guarantee",
  "broken-link",
  "schema",
  "jsonld",
  "open-graph",
  "compliance",
]);

function needsRepair(problems: QualityProblem[]): boolean {
  return problems.some((item) => item.fixable && INTEGRITY.has(item.code));
}

function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

export function runLandingQuality(input: QualityRunInput): {
  document: LandingDocument;
  sections: GeneratedSections;
  quality: LandingQuality;
  history: AutoFixHistory;
} {
  const started = Date.now();
  const source: SectionSources = {
    facts: input.facts,
    analysis: input.analysis,
    decision: input.decision,
    previous: null,
  };
  const hosts = allowedHosts(input.facts, input.analysis, input.sections.sections);
  const enabled = new Map(input.blueprint.sections.map((section) => [section.id, section.enabled]));
  let sections = input.sections.sections.slice();
  let document = input.document;
  const attempts: Record<string, number> = {};
  const exhausted = new Set<string>();
  const entries: AutoFixHistory["entries"] = [];
  let verdict = validateLanding({ document, sections, facts: input.facts, decision: input.decision, allowedHosts: hosts, enabled });

  if (needsRepair(verdict.problems)) {
    let guard = 0;
    while (needsRepair(verdict.problems) && guard < 8) {
      guard += 1;
      const ids = [...new Set(verdict.problems.filter((item) => item.fixable && !exhausted.has(item.sectionId) && (attempts[item.sectionId] ?? 0) < 3).map((item) => item.sectionId))]
        .filter(isSectionId);
      if (ids.length === 0) break;
      let changed = false;
      for (const id of ids) {
        const index = sections.findIndex((section) => section.sectionId === id);
        if (index < 0) continue;
        const current = sections[index];
        if (!current) continue;
        attempts[id] = (attempts[id] ?? 0) + 1;
        const attemptStarted = Date.now();
        const relevant = verdict.problems.filter((item) => item.sectionId === id);
        const repaired = repairSection({
          section: current,
          problems: relevant,
          source,
          facts: input.facts,
          decision: input.decision,
          allowedHosts: hosts,
        });
        entries.push({
          attempt: attempts[id] ?? 1,
          sectionId: id,
          problems: relevant.map((item) => item.message),
          changed: repaired.changed,
          note: repaired.note,
          durationMs: Math.max(0, Date.now() - attemptStarted),
          at: new Date().toISOString(),
        });
        if (repaired.changed) {
          sections = sections.slice();
          sections[index] = repaired.section;
          changed = true;
        } else exhausted.add(id);
        if ((attempts[id] ?? 0) >= 3) exhausted.add(id);
      }
      if (!changed) break;
      const generated: GeneratedSections = { ...input.sections, sections };
      document = composeLandingDocument({
        campaignId: input.campaignId,
        blueprint: input.blueprint,
        generated,
        decision: input.decision,
        previous: null,
        facts: input.facts,
        now: input.now,
      });
      verdict = validateLanding({ document, sections, facts: input.facts, decision: input.decision, allowedHosts: hosts, enabled });
    }
  }

  const stoppedBecause = verdict.score.overall >= QUALITY_MARK && !verdict.problems.some((item) => item.fixable && INTEGRITY.has(item.code))
    ? "overall"
    : Object.values(attempts).some((count) => count >= 3)
      ? "attempts"
      : "evidence";
  const delivered = new Set<string>([
    ...document.sections.map((section) => section.sectionId),
    ...(document.seo ? ["seo"] : []),
    ...(document.schema ? ["schema"] : []),
  ]);
  const open = new Set(verdict.problems.map((item) => item.sectionId));
  const approvedSections = sections
    .filter((section) => delivered.has(section.sectionId) && section.status === "GENERATED" && !open.has(section.sectionId))
    .map((section) => section.sectionId);
  const validatedAt = input.now ?? new Date().toISOString();
  return {
    document,
    sections: { ...input.sections, sections },
    quality: {
      version: 1,
      campaignId: input.campaignId,
      validatedAt,
      durationMs: Math.max(0, Date.now() - started),
      stoppedBecause,
      score: verdict.score,
      problems: verdict.problems,
      approvedSections,
      attempts,
    },
    history: { version: 1, campaignId: input.campaignId, entries },
  };
}
