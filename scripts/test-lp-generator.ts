// npx tsx scripts/test-lp-generator.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { generationHash, inputIsReady, normalizeGenerationInput } from "../src/lib/lp-generator/input.ts";
import { runGeneration } from "../src/lib/lp-generator/run.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { stripUnverifiedHop } from "../src/lib/real-product-assets/ssrf.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import type { ProductCatalog } from "../src/lib/real-product-assets/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const LIB = path.join(ROOT, "src", "lib", "lp-generator");

function source(url: string, records: EnrichmentSource["records"], html?: string): EnrichmentSource {
  return { url, retrievedAt: "2026-10-22T00:00:00.000Z", pageCategory: "PRIMARY", records, html };
}

function supplementSources(): EnrichmentSource[] {
  return [
    source("https://shop.aldermoor.example/greens", [
      { field: "description", text: "A daily greens blend in vegetable capsules." },
      { field: "feature", text: "Vegetable capsule shell" },
      { field: "feature", text: "Made without artificial colors" },
      { field: "feature", text: "Each batch is tested by an outside laboratory" },
      { field: "component", text: "Spirulina" },
      { field: "component", text: "Chlorella" },
      { field: "usage", text: "Take two capsules with water each day." },
      { field: "caution", text: "Keep out of reach of children." },
      { field: "guarantee", text: "60-day money-back guarantee." },
      { field: "manufacturer", text: "Aldermoor Labs, Inc." },
      { field: "specification", name: "Capsules per bottle", value: "60" },
      { field: "offer", packageName: "1 bottle", unitPrice: "$49", totalPrice: "$49", quantity: "1 bottle" },
      { field: "faq", question: "Are the capsules vegetarian?", text: "Yes, the capsules are vegetarian." },
    ]),
  ];
}

function beautySources(): EnrichmentSource[] {
  return [
    source("https://pellucid.example/balm", [
      { field: "description", text: "A tinted lip balm in a twist-up tube." },
      { field: "feature", text: "Fragrance-free formula" },
      { field: "component", text: "Shea butter" },
      { field: "component", text: "Beeswax" },
      { field: "usage", text: "Apply to lips as needed." },
      { field: "specification", name: "Net weight", value: "4.5", unit: "g" },
    ]),
  ];
}

function electronicSources(): EnrichmentSource[] {
  return [
    source("https://quillon.example/x2", [
      { field: "description", text: "True wireless earbuds with a charging case." },
      { field: "feature", text: "Water-resistant housing" },
      { field: "feature", text: "Touch controls" },
      { field: "component", text: "Earbuds (one pair)" },
      { field: "component", text: "Charging case" },
      { field: "specification", name: "Battery life", value: "8", unit: "hours" },
      { field: "specification", name: "Bluetooth version", value: "5.3" },
      { field: "specification", name: "Weight per earbud", value: "5.2", unit: "g" },
      { field: "specification", name: "Case battery", value: "480", unit: "mAh" },
      { field: "offer", packageName: "1 pair", unitPrice: "$59", totalPrice: "$59", quantity: "1 pair" },
      { field: "offer", packageName: "2 pairs", unitPrice: "$54 per pair", totalPrice: "$108", quantity: "2 pairs" },
      { field: "guarantee", text: "1-year limited warranty against manufacturing defects." },
    ]),
  ];
}

function thinSources(): EnrichmentSource[] {
  return [
    source("https://harlow.example/strap", [
      { field: "description", text: "Adjustable crossbody strap for phones." },
    ]),
  ];
}

function approvedCatalog(productKey: string, productName: string): ProductCatalog {
  return {
    productKey,
    productName,
    sourcePages: ["https://assets.example/pack"],
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    events: [],
    images: [
      {
        id: "img-hero",
        productKey,
        productName,
        url: "https://cdn.example/pack.jpg",
        sourcePage: "https://assets.example/pack",
        fileName: "pack.jpg",
        alt: null,
        width: 900,
        height: 900,
        format: "jpg",
        byteLength: 1200,
        probableKind: "packshot",
        relevant: true,
        match: "CONFIRMED",
        policyBlock: null,
        status: "USER_APPROVED",
        visualRole: "PRIMARY_PRODUCT",
        localFile: "pack.jpg",
        sha256: "a".repeat(64),
        discoveredAt: "2026-10-22T00:00:00.000Z",
      },
    ],
  };
}

async function generate(label: string, input: Record<string, string>, extras: Parameters<typeof runGeneration>[1] = {}) {
  const storeRoot = extras.storeRoot ?? mkdtempSync(path.join(os.tmpdir(), `lp53-${label}-`));
  const record = await runGeneration(input, { ...extras, storeRoot });
  const model = readGenerationModel(record.id, storeRoot);
  return { record, model, storeRoot };
}

async function main() {
  const libFiles = readdirSync(LIB).filter((name) => name.endsWith(".ts"));
  for (const file of libFiles) {
    const text = readFileSync(path.join(LIB, file), "utf8");
    assert(!/femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
  }

  const hop = stripUnverifiedHop("https://vendor.example/text.php?hop=zzzzz&hopId=abc");
  assert(hop.hopPlaceholder, "zzzzz hop is a placeholder");
  assert(!/hop=zzzzz/i.test(hop.href), "placeholder hop is stripped");

  const invalid = normalizeGenerationInput({ productName: "X", salesUrl: "http://example.com" });
  assert(!inputIsReady(invalid), "HTTP sales URL is rejected");

  const placeholderHop = normalizeGenerationInput({
    productName: "Northridge Capsules",
    salesUrl: "https://shop.northridge.example/capsules",
    hopLink: "https://shop.northridge.example/go?hop=zzzzz",
    language: "en",
    market: "US",
    goal: "SEND_TO_OFFER",
  });
  assert(inputIsReady(placeholderHop), "placeholder hop does not block generation");
  assert(placeholderHop.hop.previewOnly, "placeholder hop stays preview-only");
  assert(!placeholderHop.hop.href, "placeholder hop is not stored as a hop");

  const baseInput = {
    productName: "Aldermoor Greens",
    category: "dietary supplement",
    salesUrl: "https://shop.aldermoor.example/greens",
    language: "en",
    market: "US",
    goal: "INFORM",
  };
  const first = await generate("sup", baseInput, { injectedSources: supplementSources() });
  assert(["PREVIEW_READY", "NEEDS_REVIEW"].includes(first.record.status), `supplement reaches a previewable state (${first.record.status})`);
  assert(first.record.copy?.producer === "DETERMINISTIC_OFFLINE", "copy uses deterministic offline fallback");
  assert(first.record.copy?.aiUsed === false, "no real AI was used");
  assert(first.model!.copy.headline.text.includes("Aldermoor Greens"), "supplement headline keeps product identity");
  assert(!/^mimosa pudica$/i.test(first.model!.copy.headline.text), "an ingredient is not used as the headline");
  assert(Boolean(first.model), "V4 model was persisted");
  assert(first.record.assets.approvedUsed.length === 0, "no images are used without USER_APPROVED files");
  assert(first.model!.hopSlot === "none", "no hop means no purchase CTA");
  assert(!/clinically proven|verified buyer|limited time/i.test(first.model!.copy.headline.text), "headline is not invented hype");

  const second = await generate("sup2", baseInput, { injectedSources: supplementSources(), storeRoot: first.storeRoot });
  assert(second.record.id === first.record.id, "repeat input reuses the same generation");

  const forced = await generate("sup3", baseInput, { injectedSources: supplementSources(), storeRoot: first.storeRoot, force: true });
  assert(forced.record.id !== first.record.id, "force creates a new generation");
  assert(generationHash(first.record.input) === generationHash(forced.record.input), "forced rerun keeps the same input hash");

  const beauty = await generate("beauty", {
    productName: "Pellucid Rose Balm",
    category: "lip balm",
    salesUrl: "https://pellucid.example/balm",
    language: "en",
    market: "US",
    goal: "INFORM",
  }, { injectedSources: beautySources() });
  assert(Boolean(beauty.model), "beauty scenario builds");
  const beautyTypes = (beauty.model?.blueprint.sections ?? []).filter((item) => item.renderEligibility === "ELIGIBLE").map((item) => item.sectionType);
  assert(beautyTypes.includes("presentation") || beautyTypes.includes("hero"), "beauty keeps a commercial opening");

  const electronic = await generate("elec", {
    productName: "Quillon X2 Wireless Earbuds",
    category: "wireless earbuds",
    salesUrl: "https://quillon.example/x2",
    hopLink: "https://hop.example/quillon-x2",
    language: "en",
    market: "US",
    goal: "SEND_TO_OFFER",
  }, { injectedSources: electronicSources() });
  assert(Boolean(electronic.model), "electronic scenario builds");
  const elecTypes = (electronic.model?.blueprint.sections ?? []).filter((item) => item.renderEligibility === "ELIGIBLE").map((item) => item.sectionType);
  assert(elecTypes.includes("specifications") || (electronic.model?.contract.specifications?.length ?? 0) > 0, "electronic keeps specifications when present");
  assert((electronic.model?.contract.offer?.packages.length ?? 0) >= 2, "multi-offer packages stay verbatim");
  assert(electronic.model!.hopSlot !== "none", "authorized hop activates a CTA");

  const thin = await generate("thin", {
    productName: "Harlow Phone Strap",
    salesUrl: "https://harlow.example/strap",
    language: "en",
    market: "US",
    goal: "INFORM",
  }, { injectedSources: thinSources() });
  assert(Boolean(thin.model), "thin evidence still produces a model when identity exists");
  assert(!(thin.model?.contract.offer?.packages.length), "thin evidence does not invent offers");

  const noHop = await generate("nohop", {
    productName: "Brindle Travel Pillow",
    salesUrl: "https://brindle.example/pillow",
    hopLink: "https://brindle.example/go?hop=zzzzz",
    language: "en",
    market: "US",
    goal: "SEND_TO_OFFER",
  }, {
    injectedSources: [
      source("https://brindle.example/pillow", [
        { field: "description", text: "A memory-foam neck pillow with a washable cover." },
        { field: "feature", text: "Washable cover" },
      ]),
    ],
  });
  assert(noHop.model!.hopSlot === "none", "invalid hop does not become a purchase CTA");
  assert(!noHop.record.input.hopLink, "invalid hop is not stored as a hop");

  const withAssets = await generate("assets", {
    productName: "Aldermoor Greens",
    salesUrl: "https://shop.aldermoor.example/greens",
    language: "en",
    market: "US",
    goal: "INFORM",
  }, {
    injectedSources: supplementSources(),
    readCatalog: (key) => approvedCatalog(key, "Aldermoor Greens"),
  });
  assert(withAssets.record.assets.approvedUsed.length >= 1, "USER_APPROVED images are selected");
  assert(withAssets.model!.commercialImage?.src.includes("/admin/lab/real-assets/file/"), "hero uses the authorized file route");

  const pendingOnly = await generate("pending", {
    productName: "Tessel Stoneware Mugs",
    salesUrl: "https://tessel.example/mugs",
    language: "en",
    market: "US",
    goal: "INFORM",
  }, {
    injectedSources: [
      source("https://tessel.example/mugs", [
        { field: "description", text: "Hand-glazed stoneware mugs sold in sets." },
        { field: "feature", text: "Dishwasher safe" },
      ]),
    ],
    readCatalog: (key) => ({
      ...approvedCatalog(key, "Tessel Stoneware Mugs"),
      images: approvedCatalog(key, "Tessel Stoneware Mugs").images.map((item) => ({
        ...item,
        status: "PENDING_USER_APPROVAL" as const,
        localFile: null,
      })),
    }),
  });
  assert(pendingOnly.record.assets.approvedUsed.length === 0, "pending images are not used");
  assert(!pendingOnly.model!.commercialImage, "no commercial photo without approval");

  const markup = renderToStaticMarkup(createElement(V4Page, { model: first.model! }));
  assert(markup.includes('data-v4="page"'), "renderer V4 emits the page");
  assert(!/what the source states|seller-stated claims|questions the source answered/i.test(markup), "public markup has no audit headlines");

  const compositions = new Set([beauty.model?.composition, electronic.model?.composition, thin.model?.composition].filter(Boolean));
  assert(compositions.size >= 1, "composition is assigned from the contract");

  console.log(`PASS ${passed} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
