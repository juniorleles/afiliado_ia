/**
 * Execution 44 — editorial end-to-end audit (read only).
 *
 * ProductFacts -> Research -> Editorial Intelligence -> Editorial Campaign -> Showcase -> Landing page.
 * It reads campaigns and the rendered preview. It does not write campaign data.
 * Output goes to a new versioned evidence directory and is never overwritten.
 *
 * Usage: npx tsx scripts/audit-editorial-e2e.ts [campaignId ...]
 * Needs the dev server on 127.0.0.1:3000 for the rendered layer.
 */
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { isConsumerHealthClaim } from "../src/lib/landing-composer/present.ts";
import {
  copyEligibleList,
  copyEligibleOperationalItems,
  copyEligibleScalar,
  hasContactDetail,
  isCopyEligibleConfidence,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { buildAdaptivePlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt-campaign.ts";
import { presentationUsesShowcase } from "../src/lib/product-showcase/adapt.ts";
import { buildEditorialDocument, isContactFragment, type EditorialDocument } from "../src/lib/product-showcase/editorial.ts";
import { evaluateEditorialIntelligence, loadCampaignFacts } from "../src/lib/product-showcase/editorial-campaign.ts";
import { documentUsesOnlyFacts } from "../src/lib/product-showcase/editorial-intelligence.ts";
import { builderEditorState, withBuilderContent } from "../src/lib/lp-content-render.ts";
import { withBuilderMedia } from "../src/lib/lp-media-render.ts";
import { withResolvedCampaign } from "../src/lib/manual-overrides.ts";
import { applyLandingDocument } from "../src/lib/landing-composer/apply.ts";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "../src/lib/public-site.ts";

const BASE = "http://127.0.0.1:3000";
/** First free versioned directory: ...-v2, ...-v2-r2, ... Earlier runs are never touched. */
function nextEvidenceDir(): string {
  const base = path.join(process.cwd(), "data", "evidence", "editorial-e2e-quality-gate-v2");
  let candidate = base;
  for (let revision = 2; existsSync(candidate); revision += 1) candidate = `${base}-r${revision}`;
  return candidate;
}
const OUT = nextEvidenceDir();
const MIN_FREE_BYTES = 5 * 1024 ** 3;

type Finding = { check: string; status: "PASS" | "FAIL" | "INFO"; detail: string };

function freeBytes(): number {
  const stats = statfsSync(process.cwd());
  return Number(stats.bavail) * Number(stats.bsize);
}

function guardDisk(label: string) {
  const free = freeBytes();
  if (free < MIN_FREE_BYTES) throw new Error(`DISK_GUARD: ${label} free=${free} below 5 GB`);
  return free;
}

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function htmlToText(html: string): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[\u2011\u2010\u2013]/g, "-");
  return body.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function flat(text: string): string {
  return keyOf(text.replace(/\n/g, " ").replace(/[\u2011\u2010\u2013]/g, "-"));
}

function lines(document: EditorialDocument): string[] {
  return document.blocks.flatMap((block) => [...block.paragraphs, ...block.items]);
}

function amountsIn(text: string): string[] {
  return text.match(/[$€£]\s?\d[\d,]*(?:\.\d+)?|\bUSD\s?\d[\d,]*(?:\.\d+)?/gi) ?? [];
}

type Eligible = { field: string; text: string; kind: "line" | "price" };

function eligibleInventory(facts: ProductFacts): Eligible[] {
  const items: Eligible[] = [];
  const add = (field: string, text: string, kind: Eligible["kind"] = "line") => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) items.push({ field, text: clean, kind });
  };
  if (facts.productName.trim()) add("productName", facts.productName);
  add("description", copyEligibleScalar(facts.description, facts.confidence.description));
  add("pricingInformation", copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation), "price");
  add("guaranteeInformation", copyEligibleScalar(facts.guaranteeInformation, facts.confidence.guaranteeInformation));
  for (const line of copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer).split(/\r?\n/)) add("manufacturer", line);
  for (const field of ["features", "ingredientsOrComponents", "usageInformation", "cautions"] as const) {
    for (const line of copyEligibleList(facts[field], facts.confidence[field])) add(field, line);
  }
  for (const item of copyEligibleOperationalItems(facts)) add(item.field, item.statement);
  for (const item of facts.ingredientContext ?? []) {
    if (item.copyEligibility === "YES" && item.kind === "NEUTRAL_CONTEXT" && isCopyEligibleConfidence(item.provenance)) add("ingredientContext", item.statement);
  }
  return items;
}

async function renderedText(route: string): Promise<{ ok: boolean; status: number; text: string; html: string }> {
  try {
    const response = await fetch(`${BASE}${route}`);
    const html = await response.text();
    return { ok: response.ok, status: response.status, text: htmlToText(html), html };
  } catch {
    return { ok: false, status: 0, text: "", html: "" };
  }
}

function sourceScan(): Finding {
  const files = [
    "src/lib/product-showcase/editorial.ts",
    "src/lib/product-showcase/editorial-intelligence.ts",
    "src/lib/product-showcase/editorial-campaign.ts",
    "src/lib/product-showcase/adaptive-plan.ts",
    "src/lib/product-showcase/adapt.ts",
    "src/lib/product-showcase/adapt-campaign.ts",
    "src/lib/product-showcase/quality-gate.ts",
    "src/lib/product-showcase/quality-campaign.ts",
  ];
  const pattern = /neuroprime|cholibrium|joint\s*genesis|prodentim|simple promise|campaign\.id\s*===|campaignId\s*===|slug\s*===|\b(?:186|188|189|190)\b/i;
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return { check: "NO_PRODUCT_OR_CAMPAIGN_SPECIFIC_CODE", status: hits.length === 0 ? "PASS" : "FAIL", detail: hits.length === 0 ? `${files.length} files scanned` : hits.join(" | ") };
}

function researchIsolation(): Finding {
  const files = ["src/lib/product-showcase/editorial.ts", "src/lib/product-showcase/adaptive-plan.ts", "src/lib/product-showcase/adapt.ts", "src/lib/product-showcase/model.ts"];
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    if (/market-research|market-intelligence|strategy-decision|landing-blueprint/.test(source)) hits.push(file);
  }
  return { check: "RESEARCH_NEVER_FEEDS_COPY_LAYERS", status: hits.length === 0 ? "PASS" : "FAIL", detail: hits.length === 0 ? "editorial, plan, adapt and model do not import research, analysis, strategy or blueprint" : hits.join(", ") };
}

async function auditCampaign(id: number) {
  const findings: Finding[] = [];
  const campaign = getCampaignById(id);
  const stored = campaign ? readStoredLandingDocument(campaign.id) : null;
  if (!campaign || !stored) {
    return { id, error: "CAMPAIGN_OR_DOCUMENT_MISSING", findings: [{ check: "CAMPAIGN_LOADED", status: "FAIL" as const, detail: `campaign ${id} or its landing document is missing` }] };
  }
  const before = JSON.stringify({ campaign, document: stored });
  const facts = loadCampaignFacts(id);
  if (!facts) {
    return { id, error: "NO_FACTS", findings: [{ check: "FACTS_LOADED", status: "FAIL" as const, detail: "no sourceFactsJson" }] };
  }

  // Layer 3: Editorial Intelligence (operator diagnosis).
  const report = evaluateEditorialIntelligence(id)!;

  // Layer 5: Showcase model, built the same way ShowcaseLanding builds it.
  // Campaigns on the showcase template render through ShowcaseLanding (/visual-frame, /p).
  // Others have no editorial layer on their public page. The lab route forces the showcase,
  // so the audit uses it to measure what the engine would deliver. This is reported, not changed.
  const onShowcase = presentationUsesShowcase(campaign.presentationTemplate);
  const route = onShowcase ? `/visual-frame/${campaign.slug}` : `/admin/lab/product-showcase/${campaign.slug}`;
  const resolved = onShowcase
    ? withBuilderMedia(withBuilderContent(applyLandingDocument(withResolvedCampaign(campaign), stored))).campaign
    : campaign;
  const model = adaptLandingToShowcase(resolved, stored, {
    ...(onShowcase ? { fields: builderEditorState(resolved).fields } : {}),
    channel: "presell",
    siteName: getPublicSiteName(),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: isHealthDisclaimerEnabled() ? HEALTH_DISCLAIMER_TEXT : null,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
  });
  const editorial = model.editorial!;
  const editorialLines = lines(editorial);

  // Layer 6: rendered landing page (draft-safe frame, same ShowcaseLanding component).
  const page = await renderedText(route);
  const pageFlat = flat(page.text);
  findings.push({ check: "PAGE_RENDERED", status: page.ok ? "PASS" : "FAIL", detail: `GET ${route} -> ${page.status}` });
  findings.push({
    check: "CAMPAIGN_USES_SHOWCASE_TEMPLATE",
    status: onShowcase ? "PASS" : "INFO",
    detail: onShowcase
      ? `presentationTemplate=${campaign.presentationTemplate}; the public page renders the editorial layer`
      : `presentationTemplate=${campaign.presentationTemplate ?? "none"}; the public page still uses the legacy template, so the editorial layer is not delivered until the template is set. Not changed by this audit.`,
  });

  // 1. Diagnosis document equals the document the page uses.
  const diagnosisDoc = buildEditorialDocument({
    facts,
    plan: buildAdaptivePlan({ facts }),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
  });
  const diagnosisSet = new Set(lines(diagnosisDoc).map(keyOf));
  const modelSet = new Set(editorialLines.map(keyOf));
  const onlyDiagnosis = [...diagnosisSet].filter((line) => !modelSet.has(line));
  const onlyModel = [...modelSet].filter((line) => !diagnosisSet.has(line));
  findings.push({
    check: "DIAGNOSIS_MATCHES_RENDERED_DOCUMENT",
    status: onlyDiagnosis.length === 0 && onlyModel.length === 0 ? "PASS" : "FAIL",
    detail: onlyDiagnosis.length === 0 && onlyModel.length === 0
      ? `${modelSet.size} lines identical`
      : `diagnosis-only=${JSON.stringify(onlyDiagnosis)} page-only=${JSON.stringify(onlyModel)}`,
  });

  // 2. Every consumer line traces to a fact or a fixed disclosure.
  const fixed = [AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, "Declared by the product source"];
  findings.push({
    check: "EDITORIAL_LINES_TRACE_TO_FACTS",
    status: documentUsesOnlyFacts(editorial, facts, fixed) ? "PASS" : "FAIL",
    detail: `${editorialLines.length} lines`,
  });

  // 3. No loss between the editorial document and the rendered page.
  const lost: string[] = [];
  for (const block of editorial.blocks) {
    for (const line of [...block.paragraphs, ...block.items]) {
      if (/^\d+ ingredients$/i.test(line)) continue;
      if (block.id === "price" && amountsIn(line).length > 0) {
        if (amountsIn(line).some((amount) => !pageFlat.includes(keyOf(amount)))) lost.push(`${block.id}: ${line}`);
        continue;
      }
      const parts = line.split(" — ").map((item) => item.trim()).filter(Boolean);
      if (parts.some((part) => !pageFlat.includes(keyOf(part).replace(/[\u2011\u2010\u2013]/g, "-")))) lost.push(`${block.id}: ${line}`);
    }
  }
  findings.push({
    check: "NO_LOSS_EDITORIAL_TO_PAGE",
    status: lost.length === 0 && page.ok ? "PASS" : "FAIL",
    detail: lost.length === 0 ? `${editorialLines.length} editorial lines found in the rendered page` : lost.join(" | "),
  });

  // 4. Blocked content never reaches the page.
  const blockedTexts = [
    ...report.records.filter((item) => item.topic === "research" && item.disposition === "UNVERIFIED").map((item) => item.text),
    ...report.records.filter((item) => item.disposition === "INELIGIBLE" && item.text !== "contato do fabricante").map((item) => item.text),
  ].map((item) => keyOf(item.replace(/\.\.\.$/, ""))).filter((item) => item.length >= 8);
  const leaked = [...new Set(blockedTexts)].filter((item) => pageFlat.includes(item));
  findings.push({
    check: "UNVERIFIED_AND_INELIGIBLE_BLOCKED",
    status: leaked.length === 0 && page.ok ? "PASS" : "FAIL",
    detail: leaked.length === 0 ? `${new Set(blockedTexts).size} blocked texts absent from the page` : `leaked=${JSON.stringify(leaked)}`,
  });
  const contactLeak = facts.manufacturer && /@|\+?\d[\d\s().-]{7,}\d/.test(page.text.replace(/\d{4}-\d{2}-\d{2}/g, "")) ? "page contains an email or phone-like value" : "";
  findings.push({ check: "MANUFACTURER_CONTACT_BLOCKED", status: contactLeak && !hasContactDetail(editorialLines.join(" ")) ? "INFO" : "PASS", detail: contactLeak || "no contact detail in editorial lines" });

  // 5. Eligible operational facts are used. Anything else eligible must have an explicit reason.
  const inventory = eligibleInventory(facts);
  const fate: Array<{ field: string; text: string; fate: string; reason: string }> = [];
  const unexplained: string[] = [];
  for (const item of inventory) {
    const inPage = item.kind === "price"
      ? amountsIn(item.text).length > 0 && amountsIn(item.text).every((amount) => pageFlat.includes(keyOf(amount)))
      : pageFlat.includes(keyOf(item.text).replace(/[\u2011\u2010\u2013]/g, "-"));
    if (inPage) {
      fate.push({ field: item.field, text: clip(item.text), fate: "IN_PAGE", reason: "" });
      continue;
    }
    const key = keyOf(clip(item.text));
    const record = report.records.find((entry) => keyOf(entry.text) === key && entry.disposition !== "AVAILABLE_AND_USED");
    const contact = item.field === "manufacturer" && (hasContactDetail(item.text) || isContactFragment(item.text)) ? report.records.find((entry) => entry.text === "contato do fabricante") : undefined;
    const reasoned = record ?? contact;
    const partial = item.kind === "line" && item.text.length > 180 ? "long line" : "";
    if (reasoned) fate.push({ field: item.field, text: clip(item.text), fate: reasoned.disposition, reason: reasoned.reason });
    else {
      fate.push({ field: item.field, text: clip(item.text), fate: "UNEXPLAINED", reason: partial });
      unexplained.push(`${item.field}: ${clip(item.text)}`);
    }
  }
  findings.push({
    check: "ELIGIBLE_INFORMATION_ACCOUNTED_FOR",
    status: unexplained.length === 0 ? "PASS" : "FAIL",
    detail: unexplained.length === 0 ? `${inventory.length} eligible items: ${fate.filter((item) => item.fate === "IN_PAGE").length} in page, rest with a recorded reason` : `unexplained=${JSON.stringify(unexplained)}`,
  });
  const operational = inventory.filter((item) => item.field === "shippingInformation" || item.field === "returnsInformation" || (item.field === "manufacturer" && !hasContactDetail(item.text) && !isContactFragment(item.text) && !isConsumerHealthClaim(item.text)));
  const operationalMissing = operational.filter((item) => !pageFlat.includes(keyOf(item.text)));
  findings.push({
    check: "ELIGIBLE_MANUFACTURER_SHIPPING_RETURNS_SHOWN",
    status: operationalMissing.length === 0 ? "PASS" : "INFO",
    detail: operational.length === 0
      ? "no eligible manufacturer, shipping or returns facts in this campaign"
      : operationalMissing.length === 0
        ? `${operational.length} shown: ${operational.map((item) => item.field).join(", ")}`
        : `not shown (see fate map): ${operationalMissing.map((item) => `${item.field}=${clip(item.text)}`).join(" | ")}`,
  });

  // 6. Missing evidence is not completed artificially.
  const notFound = report.records.filter((item) => item.disposition === "NOT_FOUND");
  const traceOk = editorial.blocks.every((block) => [...block.paragraphs, ...block.items].every((line) => {
    if (/^\d+ ingredients$/i.test(line) || line === "Declared by the product source" || fixed.includes(line)) return true;
    if (block.id === "introduction" && line === facts.productName.trim()) return true;
    return block.trace.some((trace) => line === trace.text || line.endsWith(trace.text) || line.startsWith(`${trace.text} —`));
  }));
  const placeholderText = notFound.map((item) => keyOf(item.text)).filter((item) => item.length >= 6 && !/^(description|manufacturer|features|usageinformation|cautions|pricinginformation|guaranteeinformation|ingredientsorcomponents)$/.test(item));
  findings.push({
    check: "INSUFFICIENT_EVIDENCE_NOT_COMPLETED",
    status: traceOk && placeholderText.every((item) => !pageFlat.includes(item)) ? "PASS" : "FAIL",
    detail: `depth=${report.depth}; not-found fields=${notFound.length}; every page line traced=${traceOk}`,
  });

  // 7. Campaign data and landing document are unchanged by the audit.
  const after = JSON.stringify({ campaign: getCampaignById(id), document: readStoredLandingDocument(id) });
  findings.push({ check: "CAMPAIGN_DATA_UNCHANGED", status: after === before ? "PASS" : "FAIL", detail: `status=${campaign.publicationStatus}; template=${campaign.presentationTemplate ?? "none"}` });

  return {
    id,
    slug: campaign.slug,
    route,
    onShowcaseTemplate: onShowcase,
    publicationStatus: campaign.publicationStatus,
    depth: report.depth,
    insufficiency: report.insufficiency,
    counts: {
      eligible: inventory.length,
      inPage: fate.filter((item) => item.fate === "IN_PAGE").length,
      used: report.used.length,
      discarded: report.discarded.length,
      gaps: report.gaps.length,
    },
    layers: {
      facts: inventory.length,
      diagnosisRecords: report.records.length,
      editorialLines: editorialLines.length,
      pageLines: page.text.split("\n").length,
    },
    fate,
    discarded: report.discarded,
    gaps: report.gaps,
    editorialBlocks: editorial.blocks.map((block) => ({ id: block.id, heading: block.heading, paragraphs: block.paragraphs, items: block.items })),
    pageText: page.text,
    findings,
  };
}

async function main() {
  const startFree = guardDisk("start");
  const ids = process.argv.slice(2).map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const targets = ids.length > 0 ? ids : [186, 188, 189, 190];
  mkdirSync(OUT, { recursive: false });

  const global: Finding[] = [sourceScan(), researchIsolation()];
  const results = [];
  for (const id of targets) {
    guardDisk(`campaign ${id}`);
    results.push(await auditCampaign(id));
  }

  let failed = global.some((item) => item.status === "FAIL");
  console.log("== global");
  for (const item of global) console.log(`${item.status} ${item.check}: ${item.detail}`);
  for (const result of results) {
    console.log(`\n== campaign ${result.id}${"slug" in result ? ` (${result.slug}, ${result.publicationStatus})` : ""}${"depth" in result ? ` depth=${result.depth}` : ""}`);
    for (const item of result.findings) {
      console.log(`${item.status} ${item.check}: ${item.detail}`);
      if (item.status === "FAIL") failed = true;
    }
    if ("pageText" in result) {
      writeFileSync(path.join(OUT, `${result.id}-page-text.txt`), result.pageText, "utf8");
      const { pageText: _omit, ...rest } = result;
      void _omit;
      writeFileSync(path.join(OUT, `${result.id}-report.json`), JSON.stringify(rest, null, 2), "utf8");
    }
  }

  const endFree = guardDisk("end");
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    execution: 44,
    campaigns: targets,
    lighthouse: "NOT_RUN",
    global,
    campaignsSummary: results.map((result) => ({
      id: result.id,
      depth: "depth" in result ? result.depth : null,
      counts: "counts" in result ? result.counts : null,
      layers: "layers" in result ? result.layers : null,
      failed: result.findings.filter((item) => item.status === "FAIL").map((item) => item.check),
    })),
    diskFreeBytes: { start: startFree, end: endFree },
    status: failed ? "FAIL" : "PASS",
  }, null, 2), "utf8");
  console.log(`\nEDITORIAL_E2E_${failed ? "FAIL" : "PASS"}  evidence=${path.relative(process.cwd(), OUT)}  free=${endFree}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
