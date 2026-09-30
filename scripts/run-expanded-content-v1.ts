/**
 * EXPANDED CONTENT V1
 *
 * --phase=source  Fresh primary import + first-party support-source expansion
 *                 (same origin, depth 1, robots respected, no bypass). Stops
 *                 when retrieval fails or copy-eligible evidence is corrupted.
 * --phase=report  Summarizes a completed generic replay in the same directory.
 *
 * No paid calls. Content generation runs through run-generic-lp-engine-replay.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImportBlockedError, ImportFetchError, importProductFromUrl } from "../src/lib/import-product.ts";
import { expandFirstPartySources } from "../src/lib/first-party-source-expansion.ts";
import {
  copyEligibleOperationalItems,
  getConsumerCopyEligibleFacts,
  hasEncodingCorruption,
  isCopyEligibleConfidence,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import type { FetchImpl } from "../src/lib/source-resolution/types.ts";

function arg(name: string): string {
  const row = process.argv.find((item) => item.startsWith(`--${name}=`));
  return row ? row.slice(name.length + 3) : (process.env[`EXPANDED_${name.toUpperCase()}`] ?? "");
}

type FetchRecord = { requestUrl: string; finalUrl: string; status: number; contentType: string };

const FIELDS: FactField[] = [
  "productName",
  "description",
  "features",
  "ingredientsOrComponents",
  "usageInformation",
  "cautions",
  "pricingInformation",
  "guaranteeInformation",
  "manufacturer",
];

/** Every value that could reach consumer copy, before copy projection filters it. */
function copyEligibleEvidence(facts: ProductFacts): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = [];
  for (const field of FIELDS) {
    if (!isCopyEligibleConfidence(facts.confidence[field])) continue;
    const value = facts[field];
    for (const text of Array.isArray(value) ? value : value ? [value] : []) out.push({ field, text });
  }
  for (const entry of facts.ingredientContext ?? []) {
    if (entry.copyEligibility === "YES") out.push({ field: "ingredientContext", text: entry.statement });
  }
  for (const fact of [...(facts.returnsInformation ?? []), ...(facts.shippingInformation ?? [])]) {
    if (fact.copyEligibility !== "YES") continue;
    out.push({ field: fact.sourcePageCategory, text: fact.statement });
    if (fact.question) out.push({ field: `${fact.sourcePageCategory}:question`, text: fact.question });
  }
  if (facts.productFormat?.copyEligibility === "YES") out.push({ field: "productFormat", text: facts.productFormat.statement });
  return out;
}

async function sourcePhase(outDir: string, productName: string, sourceUrl: string) {
  const write = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const fetchLog: FetchRecord[] = [];
  let primaryHtml = "";
  const fetchImpl: FetchImpl = async (input, init) => {
    const requestUrl = String(input);
    const response = await fetch(input, init);
    fetchLog.push({
      requestUrl,
      finalUrl: response.url || requestUrl,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
    });
    if (requestUrl === sourceUrl && response.ok) primaryHtml = await response.clone().text();
    return response;
  };

  let facts: ProductFacts;
  try {
    facts = await importProductFromUrl(sourceUrl, { operatorProductName: productName }, { fetchImpl, importId: `expanded-${Date.now()}` });
  } catch (err) {
    write("fresh-source-resolution.json", {
      originalOperatorUrl: sourceUrl,
      fetchLog,
      resolution: err instanceof ImportBlockedError ? err.reason : err instanceof ImportFetchError ? "FETCH_ERROR" : "ERROR",
      detail: err instanceof Error ? err.message : String(err),
      bypassAttempted: false,
    });
    console.log("FRESH_SOURCE_OK=NO stage=PRIMARY");
    process.exitCode = 2;
    return;
  }
  if (!primaryHtml || facts.webDiscovery?.triggered) {
    write("fresh-source-resolution.json", { originalOperatorUrl: sourceUrl, fetchLog, resolution: "PRIMARY_NOT_RETRIEVED", bypassAttempted: false });
    console.log("FRESH_SOURCE_OK=NO stage=PRIMARY_HTML");
    process.exitCode = 2;
    return;
  }

  const expansion = await expandFirstPartySources(facts, primaryHtml, sourceUrl, { fetchImpl });
  const expanded = expansion.facts;
  const fetchedSupport = expansion.fetched.filter((page) => page.httpStatus === 200);
  write("fresh-source-resolution.json", {
    originalOperatorUrl: sourceUrl,
    retrievedAt: new Date().toISOString(),
    fetchLog,
    primaryHttpStatus: fetchLog.find((item) => item.requestUrl === sourceUrl)?.status ?? null,
    resolution: "PRIMARY_OK",
    sameOriginOnly: expansion.sameOriginOnly,
    maxDepth: expansion.maxDepth,
    robotsRespected: true,
    bypassAttempted: false,
    discovered: expansion.discovered.map((page) => ({ url: page.url, category: page.category, eligible: page.eligible, rejectReason: page.rejectReason ?? null })),
    fetched: expansion.fetched.map((page) => ({ url: page.url, category: page.category, httpStatus: page.httpStatus ?? null, factualUnits: page.factualUnits ?? null })),
  });

  const evidence = copyEligibleEvidence(expanded);
  const corrupted = evidence.filter((item) => hasEncodingCorruption(item.text));
  write("encoding-report.json", {
    copyEligibleEvidenceChecked: evidence.length,
    ENCODING_CORRUPTION_IN_COPY_ELIGIBLE_EVIDENCE: corrupted.length,
    corrupted,
  });
  write("fresh-product-facts.json", { facts: expanded });

  const eligible = getConsumerCopyEligibleFacts(expanded);
  const operational = copyEligibleOperationalItems(expanded);
  write("fresh-evidence-summary.json", {
    features: eligible.features,
    featureProvenance: expanded.confidence.features,
    productFormat: { value: eligible.productFormatValue, statement: eligible.productFormat },
    returnsCopyEligible: eligible.returnsInformation,
    shippingCopyEligible: eligible.shippingInformation,
    returnsTotal: expanded.returnsInformation?.length ?? 0,
    shippingTotal: expanded.shippingInformation?.length ?? 0,
    operationalItems: operational.length,
  });

  const ok = fetchedSupport.length > 0 && corrupted.length === 0;
  console.log(
    `FRESH_SOURCE_OK=${fetchedSupport.length > 0 ? "YES" : "NO"} supportPages=${fetchedSupport.length} ENCODING_CORRUPTION=${corrupted.length} features=${eligible.features.length}/${expanded.confidence.features} returns=${eligible.returnsInformation.length} shipping=${eligible.shippingInformation.length} format=${eligible.productFormatValue || "none"}`,
  );
  if (!ok) process.exitCode = 2;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function reportPhase(outDir: string) {
  const read = (name: string) => JSON.parse(readFileSync(path.join(outDir, name), "utf8"));
  const replay = read("replay-report.json");
  const gate = existsSync(path.join(outDir, "content-gate.json")) ? read("content-gate.json") : null;
  const grounding = read("grounding.json");
  const policy = read("policy.json");
  const authority = read("semantic-authority.json");
  const raw = existsSync(path.join(outDir, "generation-raw.json")) ? read("generation-raw.json") : null;
  const body: string = gate?.copy?.body ?? "";
  const headline: string = gate?.copy?.headline ?? "";
  const sections = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]);
  const bindingViolations = (grounding.modelWordingViolations?.length ?? 0) + (grounding.modelAuthorityViolations?.length ?? 0);
  const unsupported = (grounding.unsupportedClaims?.length ?? 0) + (grounding.pageLevelUnsupportedClaims?.length ?? 0);
  const blockingPolicy = (policy.findings ?? []).filter((item: { status: string }) => item.status === "fail");
  const contentReady =
    replay.contentModelCalls === 1 &&
    grounding.status === "GROUNDED" &&
    unsupported === 0 &&
    bindingViolations === 0 &&
    (grounding.structuralViolations?.length ?? 0) === 0 &&
    (grounding.unauthorizedSlotFills?.length ?? 0) === 0;
  write(outDir, "generated-content.json", { headline, body, ctaLabel: gate?.ctaLabel ?? null, faqItems: gate?.faqItems ?? [], fills: raw?.fills ?? [] });
  write(outDir, "validation-report.json", {
    semanticAuthority: authority.result,
    grounding: grounding.status,
    unsupportedClaims: unsupported,
    propositionBindingViolations: bindingViolations,
    structuralViolations: grounding.structuralViolations?.length ?? 0,
    policyGate: policy.policyGate,
    policyFindings: policy.findings ?? [],
    blockingPolicyFindings: blockingPolicy.length,
    contentReadiness: contentReady ? "CONTENT_READY" : "CONTENT_BLOCKED",
    publicationReadiness: gate?.contentGate ?? "NOT_RUN",
    sectionCount: sections.length,
    sections,
    wordCount: countWords(`${headline} ${body}`),
  });
  write(outDir, "cost-report.json", {
    contentModel: "anthropic:claude-sonnet-4-5-20250929",
    contentModelCalls: replay.contentModelCalls,
    maxContentModelCalls: 1,
    openAiTextCalls: 0,
    openAiImageCalls: 0,
    visualCalls: 0,
  });
  console.log(`SECTIONS=${sections.join(" | ")} WORDS=${countWords(`${headline} ${body}`)} CONTENT_READINESS=${contentReady ? "CONTENT_READY" : "CONTENT_BLOCKED"}`);
}

function write(outDir: string, name: string, value: unknown) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const outDir = path.join(process.cwd(), arg("out") || "data/generic-lp-engine/v1/prodentim-expanded-content-v1");
  mkdirSync(outDir, { recursive: true });
  const phase = arg("phase");
  if (phase === "source") {
    const productName = arg("product");
    const sourceUrl = arg("url");
    if (!productName || !sourceUrl) throw new Error("usage: --phase=source --product= --url= [--out=]");
    await sourcePhase(outDir, productName, sourceUrl);
    return;
  }
  if (phase === "report") {
    reportPhase(outDir);
    return;
  }
  throw new Error("usage: --phase=source|report");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
