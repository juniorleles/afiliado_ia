import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { pairQuestionsFromHtml } from "@/lib/operational-evidence";
import {
  collapseText,
  extractHeadings,
  extractListItems,
  extractParagraphs,
  stripHiddenMarkup,
} from "@/lib/source-html";
import { publicLandingUrl } from "@/lib/campaign-sources/primary-page";
import type { ProductResearchField } from "@/lib/product-research/types";

function sanitizeInventoryUrl(raw: string): string {
  return publicLandingUrl(raw);
}

export const TRANSACTIONAL_CONTROL =
  /\b(buy now|order now|add to cart|checkout|place order|complete order|complete purchase|pay now|submit payment|proceed to payment|finalizar pedido|comprar agora|adicionar ao carrinho)\b/i;

export type PrimarySection = {
  heading: string;
  text: string;
  elementId: string | null;
};

export type PrimaryFaqItem = {
  question: string;
  answer: string | null;
  expanded: boolean;
  source: "HTML" | "ACCORDION" | "DETAILS";
  error: string | null;
};

export type PrimaryImageItem = {
  src: string;
  alt: string;
};

export type PrimaryExtractedFact = {
  field: ProductResearchField;
  text: string;
  excerpt: string;
  section: string;
  risk: "OPERATIONAL" | "HIGH_RISK";
  statementType: "SELLER_STATED";
  conditions: string[];
};

export type PrimaryPageInventory = {
  requestedUrl: string;
  finalUrl: string | null;
  title: string | null;
  sections: PrimarySection[];
  faqs: PrimaryFaqItem[];
  images: PrimaryImageItem[];
  facts: PrimaryExtractedFact[];
  missing: string[];
  extractionErrors: string[];
};

export function isTransactionalControlText(text: string): boolean {
  const value = collapseText(text);
  if (value.length > 80) return false;
  return TRANSACTIONAL_CONTROL.test(value);
}

export function extractFaqItems(html: string): PrimaryFaqItem[] {
  const faqs: PrimaryFaqItem[] = [];
  const seen = new Set<string>();
  function push(item: PrimaryFaqItem) {
    const key = collapseText(item.question).toLowerCase();
    if (!key || key.length < 8 || seen.has(key)) return;
    seen.add(key);
    faqs.push({
      ...item,
      question: collapseText(item.question),
      answer: item.answer ? collapseText(item.answer) : null,
    });
  }

  for (const match of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const block = match[1] ?? "";
    const summary = collapseText((block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ?? "").replace(/<[^>]+>/g, " "));
    const rest = collapseText(block.replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/i, " ").replace(/<[^>]+>/g, " "));
    if (/\?$/.test(summary) || /^.{8,140}\?/.test(summary)) {
      push({
        question: summary,
        answer: rest && rest !== summary ? rest : null,
        expanded: true,
        source: "DETAILS",
        error: rest ? null : "Question found without an accessible answer.",
      });
    }
  }

  for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const question = collapseText((match[1] ?? "").replace(/<[^>]+>/g, " "));
    const answer = collapseText((match[2] ?? "").replace(/<[^>]+>/g, " "));
    if (question) {
      push({
        question,
        answer: answer || null,
        expanded: Boolean(answer),
        source: "HTML",
        error: answer ? null : "Question found without an accessible answer.",
      });
    }
  }

  const paired = pairQuestionsFromHtml(html);
  for (const [answer, question] of paired.entries()) {
    const weak = collapseText(answer).length < 24 && !/\d/.test(answer) && !/[.]/.test(answer);
    push({
      question,
      answer: weak ? null : answer,
      expanded: !weak,
      source: "HTML",
      error: weak ? "Question found without an accessible answer." : null,
    });
  }

  const headingMatches = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  for (let i = 0; i < headingMatches.length; i += 1) {
    const heading = collapseText((headingMatches[i]?.[2] ?? "").replace(/<[^>]+>/g, " "));
    if (!/\?$/.test(heading)) continue;
    const start = (headingMatches[i]?.index ?? 0) + (headingMatches[i]?.[0].length ?? 0);
    const end = headingMatches[i + 1]?.index ?? html.length;
    const between = collapseText(html.slice(start, end).replace(/<[^>]+>/g, " "));
    const answer = between.length > 20 ? between : null;
    push({
      question: heading,
      answer,
      expanded: Boolean(answer),
      source: "ACCORDION",
      error: answer ? null : "Question found without an accessible answer.",
    });
  }

  return faqs;
}

export function extractPrimaryImages(html: string, pageUrl: string): PrimaryImageItem[] {
  const images: PrimaryImageItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<img\b([^>]+)>/gi)) {
    const attrs = match[1] ?? "";
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";
    const alt = attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    if (!src || src.startsWith("data:")) continue;
    if (/pixel|spacer|1x1|tracking/i.test(src)) continue;
    try {
      const absolute = new URL(src, pageUrl).toString();
      if (!/^https:/i.test(absolute)) continue;
      const publicSrc = sanitizeInventoryUrl(absolute);
      if (seen.has(publicSrc)) continue;
      seen.add(publicSrc);
      images.push({ src: publicSrc, alt: collapseText(alt) });
    } catch {
      /* skip */
    }
  }
  return images;
}

export function extractPrimarySections(html: string): PrimarySection[] {
  const cleaned = stripHiddenMarkup(html);
  const sections: PrimarySection[] = [];
  const headingRe = /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const matches = [...cleaned.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const heading = collapseText((matches[i]?.[3] ?? "").replace(/<[^>]+>/g, " "));
    if (!heading || heading.length < 3) continue;
    const start = (matches[i]?.index ?? 0) + (matches[i]?.[0].length ?? 0);
    const end = matches[i + 1]?.index ?? cleaned.length;
    const slice = cleaned.slice(start, end);
    const text = collapseText(slice.replace(/<[^>]+>/g, " "));
    const id = matches[i]?.[2]?.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null;
    if (text.length < 12 && !/\?$/.test(heading)) continue;
    sections.push({ heading, text: text.slice(0, 1200), elementId: id });
  }
  return sections.slice(0, 40);
}

function factRisk(text: string): "OPERATIONAL" | "HIGH_RISK" {
  if (classifyEditorialText({ text, role: "OTHER" }).classification === "MEDICAL_OR_HEALTH_CLAIM") return "HIGH_RISK";
  if (/\b(cure|treat|clinical trial|clinically proven|diagnose|prevents? diabetes|blood sugar|fat burn)\b/i.test(text)) {
    return "HIGH_RISK";
  }
  return "OPERATIONAL";
}

function fieldFor(text: string, section: string): ProductResearchField {
  const blob = `${section} ${text}`.toLowerCase();
  if (/\bingredient|composition|formula|proprietary blend\b/.test(blob)) return "ingredients";
  if (/\bhow to (take|use)|directions?|dropper|capsule|once a day|daily\b/.test(blob)) return "howItWorks";
  if (/\bguarantee|money[- ]back\b/.test(blob)) return "guarantee";
  if (/\bwarning|side effect|consult (your|a) (doctor|physician)\b/.test(blob)) return "warnings";
  if (/\bprice|\$\d|bottles? for\b/.test(blob)) return "pricing";
  if (/\bship|return|refund|faq|frequently asked|delivery|order\b/.test(blob)) return "faq";
  if (/\b(is .* for me|results|how long)\b/.test(blob)) return "faq";
  return "description";
}

export function extractPrimaryFacts(input: {
  html: string;
  faqs: PrimaryFaqItem[];
  sections: PrimarySection[];
}): PrimaryExtractedFact[] {
  const facts: PrimaryExtractedFact[] = [];
  const seen = new Set<string>();
  function push(partial: Omit<PrimaryExtractedFact, "statementType" | "risk" | "conditions"> & { conditions?: string[] }) {
    const text = collapseText(partial.text);
    if (!text || text.length < 24) return;
    if (isTransactionalControlText(text)) return;
    const key = `${partial.field}|${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const risk = factRisk(text);
    facts.push({
      ...partial,
      text,
      excerpt: collapseText(partial.excerpt || text).slice(0, 400),
      risk,
      statementType: "SELLER_STATED",
      conditions: [
        ...(partial.conditions ?? []),
        "Seller or affiliate page statement. Not independent scientific confirmation.",
        risk === "HIGH_RISK" ? "High-risk claim is recorded for audit and blocked from presell use until independently supported." : "Operational statement. Restate, do not strengthen.",
      ],
    });
  }

  for (const faq of input.faqs) {
    if (!faq.answer) continue;
    const text = `${faq.question} ${faq.answer}`;
    push({
      field: fieldFor(text, faq.question),
      text,
      excerpt: faq.answer,
      section: faq.question,
    });
  }

  for (const section of input.sections) {
    if (/\?$/.test(section.heading)) continue;
    const paragraphs = extractParagraphs(`<p>${section.text}</p>`).length
      ? [section.text]
      : extractListItems(`<li>${section.text}</li>`);
    for (const text of paragraphs) {
      if (text.length < 40) continue;
      push({
        field: fieldFor(text, section.heading),
        text,
        excerpt: text.slice(0, 280),
        section: section.heading,
      });
    }
  }
  return facts.slice(0, 40);
}

export function inventoryPrimaryHtml(input: {
  html: string;
  visibleText?: string;
  requestedUrl: string;
  finalUrl?: string | null;
  title?: string | null;
}): PrimaryPageInventory {
  const sections = extractPrimarySections(input.html);
  const faqs = extractFaqItems(input.html);
  const images = extractPrimaryImages(input.html, input.finalUrl || input.requestedUrl);
  const facts = extractPrimaryFacts({ html: input.html, faqs, sections });
  const missing: string[] = [];
  if (!sections.length) missing.push("No section headings were readable.");
  if (!faqs.length) missing.push("No FAQ questions were found.");
  if (faqs.some((item) => !item.answer)) missing.push("Some FAQ questions have no accessible answer.");
  if (!images.length) missing.push("No product images were found.");
  if (!facts.length) missing.push("No extractable product or commercial statements were found.");
  const visible = collapseText(input.visibleText || input.html.replace(/<[^>]+>/g, " "));
  const extractionErrors: string[] = [];
  if (visible.length < 80) extractionErrors.push("Visible text is too short to treat the page as fully extracted.");
  return {
    requestedUrl: sanitizeInventoryUrl(input.requestedUrl),
    finalUrl: input.finalUrl ? sanitizeInventoryUrl(input.finalUrl) : null,
    title: input.title ? collapseText(input.title) : null,
    sections,
    faqs,
    images,
    facts,
    missing,
    extractionErrors,
  };
}
