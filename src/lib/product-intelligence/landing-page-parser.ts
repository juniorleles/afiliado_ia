/**
 * Host record domain: landing page parser.
 *
 * Reads raw HTML or a DOM snapshot and restates measurable page signals.
 * Presence tokens mean a construct was observed. They are not judgments.
 * It never fetches a page and never invents a missing field. This layer
 * stays offline.
 */
import type { LandingPageExtractedRecord, LandingPageIssue, LandingPagePresence } from "./landing-page-evidence";

export interface LandingPageParser {
  parse(input: unknown): { record: LandingPageExtractedRecord; html: string; issues: LandingPageIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(tag);
  return match?.[1] ? decodeEntities(match[1]) : null;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  if (!match) return null;
  const inner = match[1] ?? match[2] ?? "";
  const text = stripTags(inner);
  return text === "" ? null : text;
}

function allMatches(html: string, pattern: RegExp): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  while ((match = re.exec(html))) {
    const text = stripTags(match[1] ?? "");
    if (text) out.push(text);
  }
  return out;
}

function dataField(html: string, name: string): string | null {
  const re = new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "i");
  return firstMatch(html, re);
}

function dataFields(html: string, name: string): string[] {
  return allMatches(html, new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "gi"));
}

function markupOf(input: unknown): string {
  if (!isPlainRecord(input)) return "";
  if (typeof input.rawHtml === "string" && input.rawHtml.trim() !== "") return input.rawHtml;
  const snapshot = input.domSnapshot;
  if (typeof snapshot === "string") return snapshot;
  if (isPlainRecord(snapshot)) {
    if (typeof snapshot.html === "string") return snapshot.html;
    if (typeof snapshot.innerHTML === "string") return snapshot.innerHTML;
    if (typeof snapshot.markup === "string") return snapshot.markup;
  }
  return "";
}

function presence(flag: boolean): LandingPagePresence {
  return flag ? "PRESENT" : "ABSENT";
}

function countTags(html: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return html.match(re)?.length ?? 0;
}

function linkByLabel(html: string, label: RegExp): string | null {
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = attr(match[1] ?? "", "href");
    const text = stripTags(match[2] ?? "");
    if (href && (label.test(href) || label.test(text))) return href;
  }
  return null;
}

function footerHrefs(html: string): string[] {
  const footer = /<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(html)?.[1] ?? "";
  if (!footer) return [];
  const hrefs: string[] = [];
  const re = /<a\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(footer))) {
    const href = attr(match[1] ?? "", "href");
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function imageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const src = attr(match[1] ?? "", "src");
    if (src) srcs.push(src);
  }
  return srcs;
}

function ctaTexts(html: string): string[] {
  const fromData = [...dataFields(html, "primaryCta"), ...dataFields(html, "secondaryCta"), ...dataFields(html, "cta")];
  if (fromData.length > 0) return fromData;
  const texts: string[] = [];
  const re = /<(?:a|button)\b([^>]*)>([\s\S]*?)<\/(?:a|button)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const cls = attr(match[1] ?? "", "class") ?? "";
    const dataCta = attr(match[1] ?? "", "data-cta");
    if (dataCta || /\bcta\b/i.test(cls)) {
      const text = stripTags(match[2] ?? "");
      if (text) texts.push(text);
    }
  }
  const submits = /<input\b([^>]*)type=["']submit["']([^>]*)>/gi;
  while ((match = submits.exec(html))) {
    const value = attr(`${match[1] ?? ""}${match[2] ?? ""}`, "value");
    if (value) texts.push(value);
  }
  return texts;
}

function contactOf(html: string): string | null {
  const field = dataField(html, "contactInformation") ?? dataField(html, "contact");
  if (field) return field;
  const mail = /mailto:([^"'>\s]+)/i.exec(html);
  if (mail?.[1]) return `mailto:${mail[1]}`;
  const tel = /tel:([^"'>\s]+)/i.exec(html);
  if (tel?.[1]) return `tel:${tel[1]}`;
  return null;
}

function emptyRecord(): LandingPageExtractedRecord {
  return {
    headline: null,
    subheadline: null,
    primaryCta: null,
    secondaryCta: null,
    offerStructure: null,
    priceVisibility: "ABSENT",
    guarantee: null,
    testimonials: [],
    reviews: [],
    authoritySignals: [],
    trustBadges: [],
    faq: [],
    videoPresence: "ABSENT",
    images: [],
    contactInformation: null,
    footerLinks: [],
    privacyPolicy: null,
    termsOfService: null,
    refundPolicy: null,
    title: null,
    metaDescription: null,
    canonical: null,
    language: null,
    mobileFriendly: "ABSENT",
    viewport: null,
    schemaOrg: [],
    pageSize: 0,
    assetCount: 0,
  };
}

export function createLandingPageParser(): LandingPageParser {
  return {
    parse(input) {
      const html = markupOf(input);
      const issues: LandingPageIssue[] = [];
      if (html.trim() === "") {
        return { record: emptyRecord(), html, issues: [{ field: "rawHtml", message: "Missing HTML: raw HTML or a DOM snapshot with markup is required." }] };
      }
      const ctas = ctaTexts(html);
      const viewportTag = /<meta\b[^>]*name=["']viewport["'][^>]*>/i.exec(html)?.[0] ?? "";
      const viewport = attr(viewportTag, "content");
      const htmlLang = /<html\b([^>]*)>/i.exec(html)?.[1] ?? "";
      const canonicalTag = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(html)?.[0] ?? "";
      const descTag = /<meta\b[^>]*name=["']description["'][^>]*>/i.exec(html)?.[0] ?? "";
      const hasVideo = /<video\b/i.test(html) || /<iframe\b[^>]*(youtube|vimeo)/i.test(html);
      const hasPrice = /data-field=["']price["']/i.test(html) || /\$\s*\d/.test(html) || /€\s*\d/.test(html) || /£\s*\d/.test(html);
      const schemaOrg = allMatches(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      const images = imageSrcs(html);
      const record: LandingPageExtractedRecord = {
        headline: dataField(html, "headline") ?? firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
        subheadline: dataField(html, "subheadline") ?? firstMatch(html, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i),
        primaryCta: ctas[0] ?? null,
        secondaryCta: ctas[1] ?? null,
        offerStructure: dataField(html, "offerStructure") ?? dataField(html, "offer"),
        priceVisibility: presence(hasPrice),
        guarantee: dataField(html, "guarantee"),
        testimonials: dataFields(html, "testimonial"),
        reviews: dataFields(html, "review"),
        authoritySignals: dataFields(html, "authority"),
        trustBadges: dataFields(html, "trust"),
        faq: dataFields(html, "faq").concat(allMatches(html, /<summary\b[^>]*>([\s\S]*?)<\/summary>/gi)),
        videoPresence: presence(hasVideo),
        images,
        contactInformation: contactOf(html),
        footerLinks: footerHrefs(html),
        privacyPolicy: dataField(html, "privacyPolicy") ?? linkByLabel(html, /privacy/i),
        termsOfService: dataField(html, "termsOfService") ?? linkByLabel(html, /terms/i),
        refundPolicy: dataField(html, "refundPolicy") ?? linkByLabel(html, /refund/i),
        title: firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
        metaDescription: attr(descTag, "content"),
        canonical: attr(canonicalTag, "href"),
        language: attr(htmlLang, "lang"),
        mobileFriendly: presence(Boolean(viewport)),
        viewport,
        schemaOrg,
        pageSize: html.length,
        assetCount: countTags(html, "img") + countTags(html, "script") + countTags(html, "video") + countTags(html, "iframe") + countTags(html, "link"),
      };
      return { record, html, issues };
    },
  };
}
