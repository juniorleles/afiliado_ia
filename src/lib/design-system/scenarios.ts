import fixtureFile from "../../../scripts/fixtures/universal-scenarios.json";
import { emptyProductFacts, type ProductFacts } from "@/lib/product-facts";
import { buildProductContract, type ContractInput } from "@/lib/product-contract/build";
import type { ProductContract } from "@/lib/product-contract/types";
import type { ApprovedProductAsset, ProductAssetsContract } from "@/lib/product-assets/types";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument, editorialLead } from "@/lib/product-showcase/editorial";

/**
 * Lab-only. Turns the six synthetic Execution 49 scenarios into universal contracts.
 *
 * Nothing here is read by a public route. Every scenario is fictional. The scenarios are addressed by
 * their position in the fixture file (`S1`…`S6`), never by product name, and no code below branches on
 * a name, a slug or an id.
 */

type FixtureScenario = {
  id: string;
  assets: "APPROVED" | "CANDIDATE_ONLY" | "NONE";
  cta: { href: string; label: string; previewOnly?: boolean };
  benefitCandidates: string[];
  facts: Partial<ProductFacts> & { productName: string; sourceUrl: string };
};

const SCENARIOS = (fixtureFile as { scenarios: FixtureScenario[] }).scenarios;

export type LabScenarioSummary = { key: string; fixtureId: string; productName: string };

export function labScenarioKeys(): string[] {
  return SCENARIOS.map((_, index) => `s${index + 1}`);
}

export function labScenarioSummaries(): LabScenarioSummary[] {
  return SCENARIOS.map((scenario, index) => ({ key: `s${index + 1}`, fixtureId: scenario.id, productName: scenario.facts.productName }));
}

function hydrate(partial: FixtureScenario["facts"]): ProductFacts {
  const base = emptyProductFacts(partial.productName, partial.sourceUrl, "IMPORTED");
  return { ...base, ...partial, confidence: { ...base.confidence, ...(partial.confidence ?? {}) }, importQuality: "SUFFICIENT" } as ProductFacts;
}

const SHA = "a".repeat(64);

function approvedAsset(productName: string): ApprovedProductAsset {
  return {
    id: "lab-asset-1",
    src: "/lab-fixtures/synthetic.svg",
    alt: `${productName} product image`,
    kind: "PACKSHOT",
    width: 1200,
    height: 1200,
    format: "png",
    sha256: SHA,
    origin: "MANUFACTURER_AFFILIATE_TOOLS",
    sourcePage: "https://hop.example/assets",
    authorization: {
      kind: "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
      sourceUrl: "https://hop.example/assets",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      program: "Fixture program",
      materialId: null,
      useScope: "LANDING_PAGE",
      restrictions: [],
    },
    approvalMode: "POLICY",
    approvedAt: "2026-01-01T00:00:00.000Z",
  };
}

function assetsFor(scenario: FixtureScenario, facts: ProductFacts): ProductAssetsContract {
  if (scenario.assets === "APPROVED") {
    const hero = approvedAsset(facts.productName);
    return { version: 1, productName: facts.productName, hero, approved: [hero], counts: { approved: 1, candidate: 0, rejected: 0 } };
  }
  const candidate = scenario.assets === "CANDIDATE_ONLY" ? 2 : 0;
  return { version: 1, productName: facts.productName, hero: null, approved: [], counts: { approved: 0, candidate, rejected: 0 } };
}

const TRUST = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
];

export function labContractInput(index: number): ContractInput {
  const scenario = SCENARIOS[index];
  const facts = hydrate(scenario.facts);
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: "Disclosure." });
  const { lead, summary } = editorialLead(editorial.blocks.find((block) => block.id === "introduction"));
  return {
    facts,
    slug: `lab-scenario-${index + 1}`,
    siteName: "Product Reviews",
    siteUrl: "https://site.example",
    assets: assetsFor(scenario, facts),
    cta: scenario.cta,
    legal: {
      affiliateDisclosure: "Disclosure: this page contains an affiliate link. We may earn a commission if you buy through it, at no extra cost to you.",
      healthDisclaimer: "This page is informational and is not medical advice.",
      trustLinks: TRUST,
    },
    valueProposition: { headline: lead, supporting: summary },
    benefitCandidates: scenario.benefitCandidates,
  };
}

/** Contract for scenario `s1`…`s6`, or null for an unknown key. */
export function buildLabContract(key: string): ProductContract | null {
  const match = /^s([1-9]\d*)$/.exec(key);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= SCENARIOS.length) return null;
  return buildProductContract(labContractInput(index)).contract;
}
