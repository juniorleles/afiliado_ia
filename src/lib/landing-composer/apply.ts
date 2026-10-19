import type { Campaign } from "@/lib/campaigns";
import type { BuilderGroup } from "@/lib/builder-content";
import type { ContentField } from "@/lib/lp-builder/content";
import { presentLandingDocument, stripFactLabel, type PresentedSection } from "@/lib/landing-composer/present";
import type { LandingDocument } from "@/lib/landing-composer/types";

const TITLE: Record<string, string> = {
  hero: "Hero",
  problem: "Problem",
  agitation: "Agitation",
  solution: "Solution",
  benefits: "Benefits",
  ingredients: "Ingredients",
  "scientific-evidence": "Scientific Evidence",
  testimonials: "Testimonials",
  comparison: "Comparison",
  faq: "FAQ",
  guarantee: "Guarantee",
  cta: "CTA",
  footer: "Footer",
};

function text(value: unknown): string {
  return typeof value === "string" ? stripFactLabel(value) : "";
}

const INTERNAL_KEYS = new Set([
  "approach",
  "domains",
  "editorial",
  "comparisonHeadlinePercent",
  "winner",
  "marketObservations",
  "observations",
  "hook",
  "audience",
  "triggers",
  "emotions",
  "subtext",
  "motivation",
  "keywords",
  "mentions",
  "table",
]);

function linesFrom(content: Record<string, unknown>, skip: string[] = []): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(content)) {
    if (skip.includes(key) || INTERNAL_KEYS.has(key) || value == null || value === false) continue;
    if (typeof value === "string" && stripFactLabel(value)) lines.push(stripFactLabel(value));
    else if (typeof value === "number") lines.push(`${key}: ${value}`);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && stripFactLabel(item)) lines.push(`- ${stripFactLabel(item)}`);
        else if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          const criterion = text(row.criterion);
          const measured = text(row.value);
          if (criterion && measured) {
            lines.push(`- ${criterion}: ${measured}`);
            continue;
          }
          const question = text(row.question);
          const answer = text(row.answer);
          if (question) {
            if (!answer) continue;
            lines.push(`- ${question}`);
            lines.push(answer);
            continue;
          }
          if (typeof row.type === "string" && typeof row.count === "number") continue;
          if (text(row.text)) lines.push(`- ${text(row.text)}`);
        }
      }
    }
  }
  return lines;
}

function sectionText(section: PresentedSection): string {
  if (section.kind === "overview") return `## Product overview\n\n${section.items.map((item) => `- ${item}`).join("\n")}`;
  if (section.kind === "ingredients") return `## Ingredients\n\n${section.names.map((item) => `- ${item}`).join("\n")}`;
  if (section.kind === "details") return `## Product details\n\n${section.items.map((item) => `- ${item}`).join("\n")}`;
  if (section.kind === "guarantee") return `## Guarantee\n\n${section.text}`;
  if (section.kind === "important") return `## Important information\n\n${section.items.map((item) => `- ${item}`).join("\n")}`;
  return `## Questions\n\n${section.items.map((item) => `- ${item.question}\n${item.answer}`).join("\n")}`;
}

export function documentBody(document: LandingDocument): string {
  const presented = presentLandingDocument(document);
  return [presented.description, ...presented.sections.map(sectionText)].filter(Boolean).join("\n\n");
}

function groupFor(id: string): BuilderGroup {
  if (id === "hero") return "hero";
  if (id === "benefits") return "features";
  if (id === "ingredients") return "ingredients";
  if (id === "faq") return "faq";
  if (id === "guarantee") return "guarantee";
  if (id === "problem" || id === "agitation" || id === "scientific-evidence") return "warnings";
  if (id === "solution") return "features";
  return "footer";
}

export function documentContentFields(document: LandingDocument): ContentField[] {
  const hero = document.sections.find((section) => section.sectionId === "hero");
  const cta = document.sections.find((section) => section.sectionId === "cta");
  const footer = document.sections.find((section) => section.sectionId === "footer");
  const fields: ContentField[] = [
    { id: "hero.headline", group: "hero", section: "hero", label: "Headline", kind: "headline", generated: text(hero?.content.headline) },
    { id: "hero.subheadline", group: "hero", section: "hero", label: "Subheadline", kind: "subheadline", generated: text(hero?.content.subheadline) || text(hero?.content.description) },
    { id: "hero.cta", group: "hero", section: "hero", label: "CTA", kind: "cta", generated: text(cta?.content.label) },
    { id: "footer.body", group: "footer", section: "footer", label: "Footer", kind: "long", generated: text(footer?.content.productName) },
  ];
  for (const section of document.sections) {
    if (section.sectionId === "hero" || section.sectionId === "cta" || section.sectionId === "footer") continue;
    fields.push({
      id: `document.${section.sectionId}`,
      group: groupFor(section.sectionId),
      section: section.sectionId,
      label: TITLE[section.sectionId] ?? section.sectionId,
      kind: "long",
      generated: linesFrom(section.content).join("\n"),
    });
  }
  return fields;
}

export function applyLandingDocument(campaign: Campaign, document: LandingDocument | null): Campaign {
  if (!document) return campaign;
  const hero = document.sections.find((section) => section.sectionId === "hero");
  const cta = document.sections.find((section) => section.sectionId === "cta");
  const headline = text(hero?.content.headline) || campaign.headline;
  const subheadline = text(hero?.content.subheadline) || text(hero?.content.description) || campaign.subheadline || "";
  const ctaLabel = text(cta?.content.label) || campaign.ctaLabel;
  return {
    ...campaign,
    headline,
    subheadline,
    ctaLabel,
    body: documentBody(document),
    pageComposition: null,
  };
}
