import type { LandingDocument } from "@/lib/landing-composer/types";
import { isAllowedAdText, POLICY_NEGATIVES, policyHits } from "@/lib/google-ads-generation/policy";
import type { AdEvidence, AdKeywords, AdSitelink, AdSnippet, AdText, GoogleAdsPackage } from "@/lib/google-ads-generation/types";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { ProductFacts } from "@/lib/product-facts";
import { approachEnglish, audienceEnglish } from "@/lib/section-generation/english";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

export type AdsBuildInput = {
  campaignId: number;
  slug: string;
  published: boolean;
  origin: string | null;
  brand: string | null;
  facts: ProductFacts;
  analysis: MarketIntelligenceAnalysis | null;
  decision: StrategyDecision | null;
  document: LandingDocument | null;
  now?: string;
};

const APPROACH_LINES: Record<string, string[]> = {
  BUYER_GUIDE: ["Buying guide", "Read the buying guide", "Product source", "See the product source", "Source page"],
  EDUCATIONAL: ["Educational page", "Read the source page", "Product source", "See the product source", "Source page"],
  REVIEW: ["Product review", "Read the review", "Product source", "See the product source", "Source page"],
  COMPARISON: ["Comparison page", "Compare the sources", "Product source", "See the product source", "Source page"],
};

const APPROACH_WORD: Record<string, string> = {
  BUYER_GUIDE: "guide",
  EDUCATIONAL: "page",
  REVIEW: "review",
  COMPARISON: "compare",
  QUIZ: "questions",
};

function clean(value: string): string {
  return value.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function evidence(origin: AdEvidence["origin"], field: string, text: string): AdEvidence {
  return { origin, field, text };
}

function pushText(target: AdText[], text: string, item: AdEvidence, limit: number, seen: Set<string>, max = Number.POSITIVE_INFINITY): void {
  if (target.length >= max) return;
  const value = clean(text);
  const key = value.toLowerCase();
  if (!value || value.length > limit || seen.has(key) || !isAllowedAdText(value)) return;
  seen.add(key);
  target.push({ text: value, evidence: item });
}

function clipSentence(value: string, max: number): string | null {
  const source = clean(value.split(/not intended to diagnose/i)[0] ?? value);
  const kept = source
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => clean(sentence))
    .filter((sentence) => sentence && isAllowedAdText(sentence));
  const joined = clean(kept.join(" "));
  if (!joined) return null;
  if (joined.length <= max) return joined;
  const slice = joined.slice(0, max + 1);
  const space = slice.lastIndexOf(" ");
  const clipped = clean(space > 40 ? slice.slice(0, space) : joined.slice(0, max));
  return clipped && isAllowedAdText(clipped) ? clipped : null;
}

function pathPart(value: string, fallback: string): string {
  const part = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 15);
  return part || fallback;
}

function present(document: LandingDocument | null): Set<string> {
  return new Set(document?.sections.map((section) => section.sectionId) ?? []);
}

function namesProduct(keyword: string, productName: string): boolean {
  const key = keyword.toLowerCase();
  const name = productName.toLowerCase().trim();
  if (!name || !key) return false;
  if (key.includes(name)) return true;
  const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length >= 6);
  return tokens.some((token) => key.includes(token));
}

function problemPhrase(pain: string): string | null {
  const text = clean(pain);
  if (!text || /\b(et al|pubmed|doi)\b/i.test(text) || /\(\d{4}\)/.test(text)) return null;
  if (/\b(reduces|blocks|inflammation|arthritis|supplement|fish oil|collagen)\b/i.test(text)) return null;
  const match = text.match(/\b(?:[a-z]+ ){0,2}(?:pain|stiffness|ache|discomfort)(?: or (?:pain|stiffness))?\b/i);
  const phrase = clean(match?.[0] ?? "");
  if (!phrase || phrase.split(" ").length > 4 || !isAllowedAdText(phrase)) return null;
  if (/^(is|the|a|an|of|your|how|where|do|you|to|and|or|in|on)\b/i.test(phrase)) return null;
  return phrase;
}
function keywordsOf(input: AdsBuildInput, name: string): AdKeywords {
  const brand = new Set<string>();
  const commercial = new Set<string>();
  const problem = new Set<string>();
  const longTail = new Set<string>();
  const add = (bucket: Set<string>, value: string) => {
    const text = clean(value);
    if (!text || text.length > 80 || !isAllowedAdText(text)) return;
    bucket.add(text);
  };
  add(brand, name);
  if (input.brand && namesProduct(input.brand, name)) add(brand, input.brand);
  const commercialWord = /\b(review|reviews|price|deal|official|order|discount)\b/i;
  for (const item of input.analysis?.dominantKeywords ?? []) {
    const text = clean(item.keyword);
    if (!namesProduct(text, name)) continue;
    const words = text.split(" ").filter(Boolean).length;
    if (commercialWord.test(text)) add(commercial, text);
    else if (words >= 3) add(longTail, text);
    else add(brand, text);
  }
  for (const pain of input.analysis?.dominantAudience.pains ?? []) {
    const text = problemPhrase(pain);
    if (text) add(problem, text);
  }
  const word = input.decision ? APPROACH_WORD[input.decision.approachId] : null;
  if (word && name) add(longTail, `${name} ${word === "page" ? "educational page" : word === "guide" ? "buying guide" : word}`);
  return {
    brand: [...brand],
    commercial: [...commercial],
    problem: [...problem],
    longTail: [...longTail],
  };
}

function negatives(decision: StrategyDecision | null): string[] {
  const values = new Set<string>(POLICY_NEGATIVES);
  for (const claim of decision?.claimsToAvoid ?? []) {
    const key = claim.trim().toLowerCase();
    if (key === "cure") values.add("cure");
    else if (key === "guaranteed") values.add("guaranteed results");
    else if (key === "reverse") values.add("reverse disease");
    else if (key === "instant") values.add("instant results");
    else if (key === "miracle") values.add("miracle");
    else if (key === "permanent") values.add("permanent");
    else if (key === "doctor approved") values.add("doctor approved");
  }
  return [...values];
}

function strength(input: {
  headlines: number;
  descriptions: number;
  sitelinks: number;
  callouts: number;
  snippetValues: number;
  brandKeywords: number;
  policy: "PASS" | "FAIL";
}): GoogleAdsPackage["assetStrength"] {
  const score = Math.round(
    (Math.min(input.headlines, 15) / 15) * 30
    + (Math.min(input.descriptions, 4) / 4) * 20
    + (Math.min(input.sitelinks, 4) / 4) * 15
    + (Math.min(input.callouts, 4) / 4) * 10
    + (input.snippetValues >= 3 ? 10 : input.snippetValues > 0 ? 5 : 0)
    + (input.brandKeywords > 0 ? 10 : 0)
    + (input.policy === "PASS" ? 5 : 0),
  );
  const label = score >= 80 ? "Excelente" : score >= 60 ? "Boa" : score >= 40 ? "Média" : "Fraca";
  return { score, label };
}

export function buildGoogleAdsPackage(input: AdsBuildInput): GoogleAdsPackage {
  const started = Date.now();
  const warnings: string[] = [];
  const name = clean(input.facts.productName);
  const approach = approachEnglish(input.decision?.approachId ?? null);
  const sections = present(input.document);
  const hero = input.document?.sections.find((section) => section.sectionId === "hero");
  const path = `/p/${input.slug}`;
  const origin = input.origin && input.published && input.origin.startsWith("https://") ? input.origin.replace(/\/$/, "") : null;
  const finalUrl = origin ? `${origin}${path}` : path;
  const displayPaths: [string, string] = [
    pathPart(input.slug.split("-")[0] ?? "", "source"),
    pathPart(APPROACH_WORD[input.decision?.approachId ?? ""] ?? "source", "source"),
  ];
  const displayUrl = origin ? `${new URL(finalUrl).host}/${displayPaths[0]}/${displayPaths[1]}` : path;
  if (!origin) warnings.push("A URL final é a rota da presell. Não há origem HTTPS publicada para completar o domínio.");
  if (!input.decision) warnings.push("Não há decisão de estratégia. O anúncio não assumiu um ângulo.");
  if (!input.document) warnings.push("Não há LandingDocument. Os anúncios usaram só os fatos e a decisão.");

  const seen = new Set<string>();
  const headlines: AdText[] = [];
  const addHeadline = (text: string, item: AdEvidence) => pushText(headlines, text, item, 30, seen, 15);
  if (name) addHeadline(name, evidence("ProductFacts", "productName", name));
  if (input.decision) {
    for (const line of APPROACH_LINES[input.decision.approachId] ?? ["Product source", "See the product source", "Source page", "Read the source"]) {
      addHeadline(line, evidence("StrategyDecision", "approachId", input.decision.approachId));
    }
    const word = APPROACH_WORD[input.decision.approachId];
    if (word && name) addHeadline(`${name} ${word}`, evidence("StrategyDecision", "approachId", input.decision.approachId));
  }
  const ages = (input.analysis?.dominantAudience.ages ?? []).map((item) => clean(item)).filter((item) => isAllowedAdText(item));
  if (ages[0]) addHeadline(ages[0], evidence("MarketIntelligenceAnalysis", "dominantAudience.ages", ages[0]));
  const sexes = (input.analysis?.dominantAudience.sexes ?? []).map((item) => audienceEnglish(item.label)).filter((item) => isAllowedAdText(item));
  if (sexes.length > 0) addHeadline(`For ${sexes.join(" and ")}`, evidence("MarketIntelligenceAnalysis", "dominantAudience.sexes", sexes.join(", ")));
  for (const item of input.analysis?.dominantKeywords ?? []) {
    if (!namesProduct(item.keyword, name)) continue;
    addHeadline(item.keyword, evidence("MarketIntelligenceAnalysis", "dominantKeywords", item.keyword));
  }
  const guarantee = clean(input.facts.guaranteeInformation ?? "");
  if (guarantee && sections.has("guarantee")) addHeadline(guarantee, evidence("ProductFacts", "guaranteeInformation", guarantee));
  if (sections.has("faq")) addHeadline("Questions on the page", evidence("LandingDocument", "faq", "faq"));
  if (sections.has("comparison")) addHeadline("Compare the pages", evidence("LandingDocument", "comparison", "comparison"));
  if (sections.has("benefits")) addHeadline("Benefits listed", evidence("LandingDocument", "benefits", "benefits"));
  if (sections.has("ingredients")) addHeadline("Ingredients listed", evidence("LandingDocument", "ingredients", "ingredients"));
  for (const item of input.facts.ingredientsOrComponents) {
    const ingredient = clean(item.split(/\s[-:]\s/)[0] ?? item);
    addHeadline(ingredient, evidence("ProductFacts", "ingredientsOrComponents", item));
  }
  for (const feature of input.facts.features) {
    addHeadline(feature, evidence("ProductFacts", "features", feature));
  }
  if (headlines.length < 15) warnings.push(`${headlines.length} títulos cabem na evidência. O restante não foi inventado.`);

  const descriptions: AdText[] = [];
  const descriptionSeen = new Set<string>();
  const addDescription = (text: string | null, item: AdEvidence) => {
    if (!text) return;
    pushText(descriptions, text, item, 90, descriptionSeen, 4);
  };
  const lead = typeof hero?.content.lead === "string" ? hero.content.lead : "";
  addDescription(clipSentence(lead, 90), evidence("LandingDocument", "hero.lead", lead));
  const sourceDescription = typeof hero?.content.subheadline === "string" && hero.content.subheadline.trim()
    ? hero.content.subheadline
    : input.facts.description ?? "";
  addDescription(clipSentence(sourceDescription, 90), evidence("ProductFacts", "description", sourceDescription));
  if (approach) addDescription(`This ${approach} stays with the product source.`, evidence("StrategyDecision", "approachId", input.decision?.approachId ?? approach));
  const keyword = (input.analysis?.dominantKeywords ?? []).map((item) => item.keyword).find((item) => namesProduct(item, name));
  if (keyword) addDescription(clipSentence(`Measured term: ${keyword}.`, 90), evidence("MarketIntelligenceAnalysis", "dominantKeywords", keyword));
  if (input.facts.ingredientsOrComponents.length > 0) {
    const list = input.facts.ingredientsOrComponents.map((item) => clean(item.split(/\s[-:]\s/)[0] ?? item)).filter(Boolean).join(", ");
    addDescription(clipSentence(`Source ingredients: ${list}.`, 90), evidence("ProductFacts", "ingredientsOrComponents", list));
  }
  if (descriptions.length < 4) warnings.push(`${descriptions.length} descrições cabem na evidência. O restante não foi inventado.`);

  const sitelinks: AdSitelink[] = [];
  const sitelinkSeen = new Set<string>();
  const addSitelink = (text: string, description: string | null, item: AdEvidence) => {
    const label = clean(text);
    const key = label.toLowerCase();
    if (!label || label.length > 25 || sitelinkSeen.has(key) || !isAllowedAdText(label)) return;
    const line = description && description.length <= 35 && isAllowedAdText(description) ? description : null;
    sitelinkSeen.add(key);
    sitelinks.push({ text: label, description: line, finalUrl, evidence: item });
  };
  if (name) addSitelink(name.length <= 25 ? name : "Product source", "From the product source", evidence("ProductFacts", "productName", name));
  if (approach) addSitelink(approach.length <= 25 ? approach : "Source page", "Follows the saved decision", evidence("StrategyDecision", "approachId", input.decision?.approachId ?? approach));
  if (sections.has("ingredients")) addSitelink("Ingredients", "From the product source", evidence("LandingDocument", "ingredients", "ingredients"));
  if (sections.has("faq")) addSitelink("Questions", "From the measured pages", evidence("LandingDocument", "faq", "faq"));
  if (sections.has("comparison")) addSitelink("Comparison", "From the measured pages", evidence("LandingDocument", "comparison", "comparison"));
  if (guarantee && sections.has("guarantee")) addSitelink("Source terms", clipSentence(guarantee, 35), evidence("ProductFacts", "guaranteeInformation", guarantee));

  const callouts: AdText[] = [];
  const calloutSeen = new Set<string>();
  const addCallout = (text: string, item: AdEvidence) => pushText(callouts, text, item, 25, calloutSeen);
  if (approach) addCallout(approach, evidence("StrategyDecision", "approachId", input.decision?.approachId ?? approach));
  addCallout("Product source", evidence("ProductFacts", "productName", name));
  if (input.facts.ingredientsOrComponents.length > 0) {
    const count = input.facts.ingredientsOrComponents.length;
    addCallout(`${count} ${count === 1 ? "ingredient" : "ingredients"}`, evidence("ProductFacts", "ingredientsOrComponents", String(count)));
  }
  if (guarantee) addCallout(guarantee, evidence("ProductFacts", "guaranteeInformation", guarantee));

  const structuredSnippets: AdSnippet[] = [];
  const ingredientValues: AdText[] = [];
  const ingredientSeen = new Set<string>();
  for (const item of input.facts.ingredientsOrComponents) {
    const ingredient = clean(item.split(/\s[-:]\s/)[0] ?? item);
    pushText(ingredientValues, ingredient, evidence("ProductFacts", "ingredientsOrComponents", item), 25, ingredientSeen);
    if (ingredientValues.length === 10) break;
  }
  if (ingredientValues.length >= 3) structuredSnippets.push({ header: "Types", values: ingredientValues });
  else if (input.facts.ingredientsOrComponents.length > 0) warnings.push("Snippet estruturado omitido. O Google pede ao menos 3 valores e a fonte tem menos.");

  const keywordGroups = keywordsOf(input, name);
  const issues: string[] = [];
  const scan = (label: string, text: string) => {
    for (const hit of policyHits(text)) issues.push(`${label}: ${hit}`);
  };
  const texts = [
    ...headlines.map((item) => item.text),
    ...descriptions.map((item) => item.text),
    ...callouts.map((item) => item.text),
    ...sitelinks.flatMap((item) => [item.text, item.description ?? ""]),
    ...structuredSnippets.flatMap((item) => item.values.map((value) => value.text)),
  ];
  for (const item of texts) scan("anúncio", item);
  for (const group of Object.values(keywordGroups)) for (const item of group) scan("palavra", item);
  if (!name) issues.push("O nome do produto não está nos fatos.");
  if (headlines.length < 3) warnings.push("Menos de 3 títulos sustentados.");
  if (descriptions.length < 2) warnings.push("Menos de 2 descrições sustentadas.");

  const policy = { status: issues.length > 0 ? "FAIL" as const : "PASS" as const, issues };
  return {
    version: 1,
    campaignId: input.campaignId,
    generatedAt: input.now ?? new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - started),
    approachId: input.decision?.approachId ?? null,
    strategyNote: input.decision?.adDirection ?? null,
    finalUrl,
    displayUrl,
    displayPaths,
    headlines,
    descriptions,
    sitelinks: sitelinks.slice(0, 6),
    callouts: callouts.slice(0, 8),
    structuredSnippets,
    keywords: keywordGroups,
    negativeKeywords: negatives(input.decision),
    policy,
    assetStrength: strength({
      headlines: headlines.length,
      descriptions: descriptions.length,
      sitelinks: sitelinks.length,
      callouts: callouts.length,
      snippetValues: structuredSnippets.reduce((sum, item) => sum + item.values.length, 0),
      brandKeywords: keywordGroups.brand.length,
      policy: policy.status,
    }),
    warnings,
  };
}
