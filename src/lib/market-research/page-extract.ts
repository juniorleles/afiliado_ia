import { cleanHtmlText } from "@/lib/source-html";
import type { MarketAudienceObservation, MarketPageInsight } from "@/lib/market-research/types";

const CTA_LABELS = [
  "Buy Now",
  "Learn More",
  "Claim Discount",
  "Order Today",
  "Try Today",
  "Get Started",
  "Shop Now",
  "Add to Cart",
  "Order Now",
  "Get Yours",
] as const;

const CLAIM_VERB = /\b(supports|helps|improves|boosts|promotes)\b/i;
const RISK_TERMS: Array<{ claim: string; pattern: RegExp; risk: string }> = [
  { claim: "Cure", pattern: /\bcures?\b/i, risk: "Alto" },
  { claim: "Reverse", pattern: /\brevers(?:e|es|ed|ing)\b/i, risk: "Alto" },
  { claim: "Guaranteed", pattern: /\bguaranteed\b/i, risk: "Alto" },
  { claim: "Doctor Approved", pattern: /\bdoctor approved\b/i, risk: "Alto" },
  { claim: "Instant", pattern: /\binstant\b/i, risk: "Alto" },
  { claim: "Miracle", pattern: /\bmiracle\b/i, risk: "Alto" },
  { claim: "100%", pattern: /\b100\s?%\b/i, risk: "Alto" },
  { claim: "Permanent", pattern: /\bpermanent(?:ly)?\b/i, risk: "Alto" },
];
const SCIENCE_TYPES: Array<{ type: string; pattern: RegExp }> = [
  { type: "PubMed", pattern: /pubmed(?:\.ncbi\.nlm\.nih\.gov|\.gov)?/i },
  { type: "NIH", pattern: /\bnih\.gov\b|\bncbi\.nlm\.nih\.gov\b/i },
  { type: "DOI", pattern: /\bdoi\.org\/|\bdoi:\s*10\./i },
  { type: "Clinical Study", pattern: /\bclinical (?:study|trial)\b/i },
  { type: "Peer Reviewed", pattern: /\bpeer[- ]reviewed\b/i },
];

const BENEFIT_HEADING = /\bbenefits?\b|\badvantages?\b/i;
const INGREDIENT_HEADING = /\bingredients?\b|\bformula\b|\bsupplement facts\b/i;
const FAQ_HEADING = /\bfaq\b|frequently asked/i;
const PERSONA_HEADING = /\bwho (?:it is|this is|it's) for\b|\bideal for\b/i;

export function emptyAudience(): MarketAudienceObservation {
  return { ages: [], sexes: [], pains: [], goals: [], personas: [] };
}

export function emptyInsight(url: string, domain: string, status: MarketPageInsight["status"], reason: string | null, durationMs: number): MarketPageInsight {
  return {
    url,
    domain,
    status,
    reason,
    durationMs,
    headline: null,
    subheadline: null,
    heroText: null,
    extractVersion: 2,
    structures: [],
    ctas: [],
    benefits: [],
    ingredients: [],
    faq: [],
    pricing: [],
    guarantees: [],
    claims: [],
    policyRisks: [],
    scientificEvidence: [],
    audience: emptyAudience(),
  };
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function visible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

function textOf(html: string): string {
  return cleanHtmlText(html);
}

function regionAt(html: string, index: number): string {
  const headerEnd = Math.max(html.search(/<\/header>/i), html.search(/<\/nav>/i));
  const footerStart = html.search(/<footer\b/i);
  if (headerEnd > 0 && index < headerEnd) return "Cabeçalho";
  if (footerStart > 0 && index >= footerStart) return "Rodapé";
  const h1 = html.search(/<h1\b/i);
  const h2 = html.search(/<h2\b/i);
  if (h1 >= 0 && index >= h1 && (h2 < 0 || index < h2)) return "Hero";
  return "Corpo";
}

function ctaLabel(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 40) return null;
  return CTA_LABELS.find((label) => clean.toLowerCase() === label.toLowerCase()) ?? null;
}

type Section = { heading: string; items: string[]; paragraphs: string[] };

function sectionsOf(html: string): Section[] {
  const sections: Section[] = [{ heading: "", items: [], paragraphs: [] }];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<li\b[^>]*>([\s\S]*?)<\/li>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const current = sections[sections.length - 1]!;
    if (match[1]) {
      sections.push({ heading: textOf(match[2] ?? ""), items: [], paragraphs: [] });
      continue;
    }
    if (match[3]) {
      const item = clip(textOf(match[3]), 180);
      if (item.length >= 8) current.items.push(item);
      continue;
    }
    const paragraph = clip(textOf(match[4] ?? ""), 400);
    if (paragraph.length >= 20) current.paragraphs.push(paragraph);
  }
  return sections;
}

function faqFromDetails(html: string): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  const re = /<details\b[^>]*>[\s\S]*?<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 6) {
    const question = clip(textOf(match[1] ?? ""), 180);
    const answer = clip(textOf(match[2] ?? ""), 400);
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

function faqFromJsonLd(html: string): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 6) {
    try {
      const parsed = JSON.parse(match[1] ?? "") as { "@type"?: string; mainEntity?: unknown };
      const type = parsed["@type"];
      if (type !== "FAQPage" || !Array.isArray(parsed.mainEntity)) continue;
      for (const entity of parsed.mainEntity) {
        if (!entity || typeof entity !== "object") continue;
        const row = entity as { name?: unknown; acceptedAnswer?: { text?: unknown } };
        const question = typeof row.name === "string" ? clip(row.name, 180) : "";
        const answer = typeof row.acceptedAnswer?.text === "string" ? clip(row.acceptedAnswer.text, 400) : "";
        if (question && answer) out.push({ question, answer });
      }
    } catch {
      continue;
    }
  }
  return out;
}

function pricesOf(text: string): Array<{ price: string; currency: string }> {
  const out: Array<{ price: string; currency: string }> = [];
  const seen = new Set<string>();
  const symbol = /(?:R\$|US\$|\$|€|£)\s?\d{1,4}(?:[.,]\d{2})?/g;
  const coded = /\b\d{1,4}(?:[.,]\d{2})?\s?(?:USD|EUR|GBP|BRL)\b/gi;
  const promo = /\b\d{1,2}%\s*off\b|\bbuy\s+\d+\s+get\s+\d+\b/gi;
  for (const match of text.matchAll(symbol)) {
    const price = match[0].replace(/\s+/g, " ").trim();
    if (seen.has(price.toLowerCase())) continue;
    seen.add(price.toLowerCase());
    const currency = /R\$/i.test(price) ? "BRL" : /€/.test(price) ? "EUR" : /£/.test(price) ? "GBP" : "USD";
    out.push({ price, currency });
  }
  for (const match of text.matchAll(coded)) {
    const price = match[0].replace(/\s+/g, " ").trim();
    const digits = price.match(/\d{1,4}(?:[.,]\d{2})?/)?.[0] ?? "";
    if (!digits || [...seen].some((item) => item.includes(digits))) continue;
    seen.add(price.toLowerCase());
    const currency = /BRL/i.test(price) ? "BRL" : /EUR/i.test(price) ? "EUR" : /GBP/i.test(price) ? "GBP" : "USD";
    out.push({ price, currency });
  }
  for (const match of text.matchAll(promo)) {
    const price = match[0].replace(/\s+/g, " ").trim();
    if (seen.has(price.toLowerCase())) continue;
    seen.add(price.toLowerCase());
    out.push({ price, currency: "Promoção" });
  }
  return out.slice(0, 6);
}

function guaranteesOf(text: string): Array<{ text: string; days: string | null }> {
  const pattern = /\b(\d{1,3})\s*-?\s*days?\s+(?:money[- ]back\s+)?(?:guarantee|warranty|refund)\b|\bmoney[- ]back(?:\s+guarantee)?\b|\blifetime\s+(?:guarantee|warranty)\b|\bsatisfaction\s+guarantee\b/gi;
  const out: Array<{ text: string; days: string | null }> = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const start = Math.max(0, match.index - 30);
    const window = clip(text.slice(start, match.index + match[0].length + 40), 160);
    if (window.length < 12) continue;
    const days = match[1] ?? null;
    if (!out.some((item) => item.text.toLowerCase() === window.toLowerCase())) out.push({ text: window, days });
    if (out.length >= 3) break;
  }
  return out;
}

function audienceOf(sections: Section[], text: string): MarketAudienceObservation {
  const audience = emptyAudience();
  const age = text.match(/\b(?:adults|men|women)\s+over\s+(\d{2})\b/i);
  if (age?.[0]) audience.ages.push(clip(age[0], 40));
  if (/\bfor men\b/i.test(text)) audience.sexes.push("Homens");
  if (/\bfor women\b/i.test(text)) audience.sexes.push("Mulheres");
  for (const section of sections) {
    if (PERSONA_HEADING.test(section.heading)) {
      const persona = section.paragraphs[0] ?? section.items[0];
      if (persona) audience.personas.push(clip(persona, 180));
    }
    for (const item of section.items) {
      if (audience.pains.length < 4 && item.length >= 40 && item.length <= 140 && /\b(pain|ache|stiffness|discomfort)\b/i.test(item) && /\b(is|are|helps|help|causes|cause|feels|feel|reduces|reduce|supports|support|blocks|block)\b/i.test(item)) {
        audience.pains.push(item);
      }
      if (audience.goals.length < 4 && item.length <= 90 && /\b(looking to|want to|goal is)\b/i.test(item)) {
        audience.goals.push(item);
      }
    }
  }
  audience.ages = unique(audience.ages);
  audience.sexes = unique(audience.sexes);
  audience.pains = unique(audience.pains);
  audience.goals = unique(audience.goals);
  audience.personas = unique(audience.personas);
  return audience;
}

export function isBlockedInterstitial(html: string): boolean {
  const sample = textOf(html.slice(0, 1500)).toLowerCase();
  return /just a moment|attention required|access denied|cf-browser-verification|enable javascript and cookies|403 forbidden/.test(sample);
}

export function extractPage(html: string): Omit<MarketPageInsight, "url" | "domain" | "status" | "reason" | "durationMs"> {
  const markup = visible(html);
  const sections = sectionsOf(markup);
  const pageText = textOf(markup);
  const h1 = textOf(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(markup)?.[1] ?? "");
  const h2 = textOf(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(markup)?.[1] ?? "");
  const heroSection = sections.find((section) => section.heading === h1);
  const heroParagraph = heroSection?.paragraphs[0] ?? null;

  const ctaCounts = new Map<string, { text: string; position: string; frequency: number }>();
  const control = /<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi;
  let controlMatch: RegExpExecArray | null;
  while ((controlMatch = control.exec(markup))) {
    const label = ctaLabel(textOf(controlMatch[1] ?? ""));
    if (!label || controlMatch.index === undefined) continue;
    const position = regionAt(markup, controlMatch.index);
    const key = `${label.toLowerCase()}|${position}`;
    const current = ctaCounts.get(key);
    if (current) current.frequency += 1;
    else ctaCounts.set(key, { text: label, position, frequency: 1 });
  }

  const benefits: string[] = [];
  const ingredients: string[] = [];
  const claims: string[] = [];
  for (const section of sections) {
    const benefitSection = BENEFIT_HEADING.test(section.heading);
    const ingredientSection = INGREDIENT_HEADING.test(section.heading);
    for (const item of section.items) {
      if (benefitSection || CLAIM_VERB.test(item)) benefits.push(item);
      if (ingredientSection && item.length <= 80 && !CLAIM_VERB.test(item)) ingredients.push(item);
    }
    for (const paragraph of section.paragraphs) {
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
        if (CLAIM_VERB.test(sentence)) claims.push(clip(sentence, 220));
      }
    }
  }

  const faq = uniqueFaq([...faqFromJsonLd(html), ...faqFromDetails(markup), ...questionHeadings(sections)]);
  const pricing = pricesOf(pageText);
  const guarantees = guaranteesOf(pageText);
  const audience = audienceOf(sections, pageText);
  const policyRisks = RISK_TERMS.flatMap((term) => {
    const match = pageText.match(term.pattern);
    if (!match || match.index === undefined) return [];
    const start = Math.max(0, match.index - 36);
    return [{ claim: term.claim, risk: term.risk, excerpt: clip(pageText.slice(start, match.index + match[0].length + 36), 120) }];
  }).map((item) => ({ claim: item.claim, risk: item.risk }));

  const structures: string[] = [];
  if (h1) structures.push("Hero");
  if (benefits.length > 0) structures.push("Benefits");
  if (ingredients.length > 0) structures.push("Ingredients");
  if (/\btestimonials?\b|\bcustomer stories\b/i.test(sections.map((section) => section.heading).join(" "))) structures.push("Testimonials");
  if (faq.length > 0 || sections.some((section) => FAQ_HEADING.test(section.heading))) structures.push("FAQ");
  if (guarantees.length > 0) structures.push("Guarantee");
  if (ctaCounts.size > 0) structures.push("CTA");
  if (/<footer\b/i.test(html)) structures.push("Footer");

  const scientificEvidence = SCIENCE_TYPES.filter((item) => item.pattern.test(`${html} ${pageText}`)).map((item) => {
    const ingredient = ingredients.find((name) => pageText.toLowerCase().includes(name.toLowerCase()) && new RegExp(`${item.pattern.source}[\\s\\S]{0,80}${name}|${name}[\\s\\S]{0,80}${item.pattern.source}`, "i").test(pageText));
    return { ingredient: ingredient ?? "Não associado", type: item.type };
  });

  return {
    headline: h1 || null,
    subheadline: h2 || null,
    heroText: heroParagraph ?? null,
    structures,
    ctas: [...ctaCounts.values()],
    benefits: unique(benefits).slice(0, 12),
    ingredients: unique(ingredients).slice(0, 20),
    faq: faq.slice(0, 6),
    pricing,
    guarantees,
    claims: unique(claims).slice(0, 8),
    policyRisks,
    scientificEvidence,
    audience,
    extractVersion: 2,
  };
}

function questionHeadings(sections: Section[]): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  for (const section of sections) {
    if (!section.heading.includes("?") && !FAQ_HEADING.test(section.heading)) continue;
    if (!section.heading.includes("?")) continue;
    const answer = section.paragraphs[0] ?? section.items[0] ?? "";
    if (answer) out.push({ question: clip(section.heading, 180), answer: clip(answer, 400) });
  }
  return out;
}

function uniqueFaq(items: Array<{ question: string; answer: string }>): Array<{ question: string; answer: string }> {
  const seen = new Set<string>();
  const out: Array<{ question: string; answer: string }> = [];
  for (const item of items) {
    const key = item.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
