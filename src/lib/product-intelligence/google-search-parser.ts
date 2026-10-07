/**
 * Host record domain: google search parser.
 *
 * Reads a search context and restates measurable search and advertisement
 * signals. Presence tokens mean a construct was observed. They are not
 * judgments. It never fetches a page and never invents a missing field.
 * This layer stays offline.
 */
import type { GoogleSearchExtractedRecord, GoogleSearchIssue, GoogleSearchPresence } from "./google-search-evidence";

export interface GoogleSearchParser {
  parse(input: unknown): { record: GoogleSearchExtractedRecord; html: string; issues: GoogleSearchIssue[] };
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

function dataFieldHrefs(html: string, name: string): string[] {
  const hrefs: string[] = [];
  const re = new RegExp(`<[^>]*data-field=["']${name}["'][^>]*>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = attr(match[0] ?? "", "href");
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function markupOf(input: unknown): string {
  if (!isPlainRecord(input)) return "";
  const context = input.searchContext;
  if (typeof context === "string") return context;
  if (isPlainRecord(context)) {
    if (typeof context.html === "string") return context.html;
    if (typeof context.innerHTML === "string") return context.innerHTML;
    if (typeof context.markup === "string") return context.markup;
  }
  return "";
}

function presence(flag: boolean): GoogleSearchPresence {
  return flag ? "PRESENT" : "ABSENT";
}

function firstHrefOrText(html: string, name: string): string | null {
  return dataFieldHrefs(html, name)[0] ?? dataField(html, name);
}

function listOf(html: string, name: string): string[] {
  const hrefs = dataFieldHrefs(html, name);
  const texts = dataFields(html, name);
  return hrefs.length > 0 ? hrefs : texts;
}

function sponsoredOf(html: string): { count: number; official: string | null; affiliates: string[]; marketplaces: string[] } {
  const tags: string[] = [];
  const re = /<[^>]*data-field=["']sponsored["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) tags.push(match[0] ?? "");
  const official: string[] = [];
  const affiliates: string[] = [];
  const marketplaces: string[] = [];
  for (const tag of tags) {
    const href = attr(tag, "href");
    const who = (attr(tag, "data-advertiser") ?? "").toLowerCase();
    const value = href ?? who;
    if (who === "official" && value) official.push(href ?? value);
    if (who === "affiliate" && value) affiliates.push(href ?? value);
    if (who === "marketplace" && value) marketplaces.push(href ?? value);
  }
  return {
    count: tags.length,
    official: official[0] ?? null,
    affiliates,
    marketplaces,
  };
}

function emptyRecord(): GoogleSearchExtractedRecord {
  return {
    searchResultPresence: "ABSENT",
    officialWebsite: null,
    marketplacePresence: "ABSENT",
    reviewWebsites: [],
    comparisonWebsites: [],
    faqResults: [],
    relatedSearches: [],
    searchSuggestions: [],
    peopleAlsoAskPresence: "ABSENT",
    knowledgePanelPresence: "ABSENT",
    sponsoredResultPresence: "ABSENT",
    sponsoredResultCount: 0,
    officialAdvertiser: null,
    affiliateAdvertisers: [],
    marketplaceAdvertisers: [],
  };
}

export function createGoogleSearchParser(): GoogleSearchParser {
  return {
    parse(input) {
      const html = markupOf(input);
      if (html.trim() === "") {
        return {
          record: emptyRecord(),
          html,
          issues: [{ field: "searchContext", message: "Invalid Search Context: a search context with markup is required." }],
        };
      }
      const organic = listOf(html, "organic").concat(listOf(html, "searchResult"));
      const marketplace = listOf(html, "marketplace");
      const sponsored = sponsoredOf(html);
      const paa = dataFields(html, "peopleAlsoAsk").concat(dataFields(html, "paa"));
      const panel = dataField(html, "knowledgePanel");
      const record: GoogleSearchExtractedRecord = {
        searchResultPresence: presence(organic.length > 0),
        officialWebsite: firstHrefOrText(html, "officialWebsite"),
        marketplacePresence: presence(marketplace.length > 0),
        reviewWebsites: listOf(html, "review"),
        comparisonWebsites: listOf(html, "comparison"),
        faqResults: dataFields(html, "faq"),
        relatedSearches: dataFields(html, "relatedSearch"),
        searchSuggestions: dataFields(html, "suggestion"),
        peopleAlsoAskPresence: presence(paa.length > 0),
        knowledgePanelPresence: presence(Boolean(panel)),
        sponsoredResultPresence: presence(sponsored.count > 0),
        sponsoredResultCount: sponsored.count,
        officialAdvertiser: sponsored.official,
        affiliateAdvertisers: sponsored.affiliates,
        marketplaceAdvertisers: sponsored.marketplaces,
      };
      return { record, html, issues: [] };
    },
  };
}
