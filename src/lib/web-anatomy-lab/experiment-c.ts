/**
 * EXPERIMENT_C — Experiment B visual system + validated RICH replay V4 copy.
 * Lab-only. Reads the frozen V4 artifact. Does not write campaigns or V4 files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/campaigns";
import { createCreativeCompositionPlan } from "@/lib/creative/planner";
import { serializeCreativeCompositionPlan } from "@/lib/creative/plan";
import type { ScenePlan } from "@/lib/creative/types";
import { parseDesignPlan, VISUAL_THEMES, type DesignPlan, type VisualTheme } from "@/lib/design/plan";
import { createDesignPlan } from "@/lib/design/planner";
import {
  parsePresellPage,
  serializePresellPage,
  type PresellFaqItem,
  type PresellImage,
  type PresellPage,
  type PresellSection,
  type PresellSectionId,
} from "@/lib/presell-page";

export const EXPERIMENT_C_CONTENT_SOURCE = "data/web-anatomy-lab/v1/controlled-rich-replay-v4/REPORT.json";

const SCENE_ORDER = ["hero", "overview", "features", "usage", "cta-bridge", "guarantee", "trust"];

type V4Copy = {
  HEADLINE: string;
  SUMMARY: string;
  OVERVIEW: string;
  FEATURES: string;
  USAGE: string;
  GUARANTEE: string;
  FINAL_THOUGHTS: string;
  FAQS: string;
};

export type ExperimentCContent = {
  source: string;
  copy: V4Copy;
  page: PresellPage;
};

function artifactPath(): string {
  return path.join(process.cwd(), EXPERIMENT_C_CONTENT_SOURCE);
}

export function loadExperimentCCopy(): V4Copy {
  const report = JSON.parse(readFileSync(artifactPath(), "utf8")) as { GENERATED_COPY?: V4Copy };
  const copy = report.GENERATED_COPY;
  if (!copy?.HEADLINE || !copy.SUMMARY || !copy.OVERVIEW || !copy.FEATURES || !copy.USAGE || !copy.GUARANTEE || !copy.FAQS) {
    throw new Error("V4 accepted copy is missing from the replay report.");
  }
  return copy;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFaqs(text: string): PresellFaqItem[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const body = line.replace(/^FAQ\d+:\s*/, "");
      const match = body.match(/^(.+?\?)\s+([\s\S]+)$/);
      if (!match) throw new Error("V4 FAQ line is not a question plus answer.");
      return { question: match[1].trim(), answer: match[2].trim() };
    });
}

function section(
  id: PresellSectionId,
  title: string,
  visible: boolean,
  fields: Partial<Pick<PresellSection, "paragraphs" | "bullets" | "faq">> = {},
): PresellSection {
  return {
    id,
    title,
    visible,
    paragraphs: fields.paragraphs ?? [],
    bullets: fields.bullets ?? [],
    cards: [],
    faq: fields.faq ?? [],
  };
}

function placeholderImage(productName: string): PresellImage {
  return {
    src: "",
    alt: productName ? `${productName} product visual placeholder` : "Product visual placeholder",
    provenance: "PLACEHOLDER",
  };
}

export function buildExperimentCPage(copy: V4Copy, image: PresellImage, template: PresellPage["template"], ctaLabel: string, badge: string): PresellPage {
  const features = paragraphs(copy.FEATURES);
  const faqs = parseFaqs(copy.FAQS);
  return {
    version: 1,
    template,
    hero: {
      badge,
      headline: copy.HEADLINE.trim(),
      subheadline: copy.SUMMARY.trim(),
      summary: copy.SUMMARY.trim(),
      highlights: [],
      image,
    },
    sections: [
      section("quickSummary", "Quick Summary", false),
      section("overview", "Overview", true, { paragraphs: [copy.OVERVIEW.trim()] }),
      section("features", "Key Features", true, { bullets: features }),
      section("ingredients", "Ingredients / Components", false),
      section("usage", "How to Use", true, { paragraphs: [copy.USAGE.trim()] }),
      section("pros", "Pros", false),
      section("considerations", "Things to Consider", false),
      section("guarantee", "Guarantee", true, { paragraphs: [copy.GUARANTEE.trim()] }),
      section("faq", "FAQ", true, { faq: faqs }),
    ],
    ctaLabel,
    omitted: [
      { component: "Pricing", reason: "NOT_FOUND" },
      { component: "Manufacturer", reason: "NOT_FOUND" },
      { component: "Testimonials", reason: "NOT_FOUND" },
      { component: "Ratings", reason: "NOT_FOUND" },
      { component: "Ingredients", reason: "NOT_IN_VARIANT" },
      { component: "Final Thoughts", reason: "NOT_IN_VARIANT" },
    ],
    guaranteeDaysDisplay: null,
  };
}

function themeOf(campaign: Campaign): VisualTheme {
  const value = campaign.visualTheme || "";
  return (VISUAL_THEMES as readonly string[]).includes(value) ? (value as VisualTheme) : "PREMIUM";
}

function designFor(campaign: Campaign, page: PresellPage): DesignPlan {
  return parseDesignPlan(campaign.designPlanJson) ?? createDesignPlan({ page, theme: themeOf(campaign) });
}

function orderScenes(scenes: ScenePlan[]): ScenePlan[] {
  return [...scenes].sort((a, b) => {
    const ai = SCENE_ORDER.indexOf(a.id);
    const bi = SCENE_ORDER.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export function loadExperimentCContent(campaign: Campaign): ExperimentCContent {
  const stored = parsePresellPage(campaign.pageComposition);
  const copy = loadExperimentCCopy();
  const image = stored?.hero.image?.src ? stored.hero.image : placeholderImage(copy.HEADLINE);
  const page = buildExperimentCPage(
    copy,
    image,
    stored?.template ?? "REVIEW",
    campaign.ctaLabel || "Learn More",
    stored?.hero.badge || "Review",
  );
  return { source: EXPERIMENT_C_CONTENT_SOURCE, copy, page };
}

/** In-memory campaign. Does not persist. */
export function campaignForExperimentC(campaign: Campaign): Campaign {
  const content = loadExperimentCContent(campaign);
  const design = designFor(campaign, content.page);
  const creative = createCreativeCompositionPlan({ page: content.page, design });
  creative.scenes = orderScenes(creative.scenes);
  return {
    ...campaign,
    headline: content.page.hero.headline,
    ctaLabel: content.page.ctaLabel,
    pageComposition: serializePresellPage(content.page),
    creativeCompositionJson: serializeCreativeCompositionPlan(creative),
  };
}
