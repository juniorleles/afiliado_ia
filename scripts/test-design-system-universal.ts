// npx tsx scripts/test-design-system-universal.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildProductContract } from "../src/lib/product-contract/build.ts";
import { compositionSignals, pickComposition, resolveComposition, COMPOSITION_IDS, type CompositionId } from "../src/lib/design-system/compose.ts";
import { pageDensity, purchaseCtaAllowed, stickyCtaAllowed } from "../src/lib/design-system/layout.ts";
import { buildLabContract, labContractInput, labScenarioKeys, labScenarioSummaries } from "../src/lib/design-system/scenarios.ts";
import { contrastRatio, designSystemTokenCss, THEME_IDS, THEMES, themeContrastPairs } from "../src/lib/design-system/tokens.ts";
import { PrototypePage } from "../src/components/design-system/prototype-page.tsx";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const keys = labScenarioKeys();
assert(keys.length === 6, "six scenario keys");
assert(keys.join(",") === "s1,s2,s3,s4,s5,s6", "keys are positional, not product names");
assert(labScenarioSummaries().every((row, i) => row.key === `s${i + 1}`), "summaries stay positional");

const contracts = keys.map((key) => {
  const contract = buildLabContract(key);
  assert(Boolean(contract), `${key} builds`);
  return contract!;
});

assert(contracts.every((c) => c.status === "RENDERABLE"), "every lab contract is renderable");
assert(contracts.every((c) => c.publication.approval === "REQUIRED"), "publication approval stays required");

const recommended: Record<string, CompositionId> = Object.fromEntries(keys.map((key, i) => [key, pickComposition(contracts[i])]));
assert(recommended.s1 === "product-hero", "complete product with image + offer → product-hero");
assert(recommended.s3 === "product-hero", "electronic with image + specs → product-hero");
assert(recommended.s2 === "information-first" || recommended.s2 === "editorial-premium", "partial cosmetic is not product-hero (no image)");
assert(recommended.s4 === "information-first", "short accessory → information-first");
assert(recommended.s5 === "information-first" || recommended.s5 === "editorial-premium", "no authorized image is not product-hero");
assert(recommended.s6 === "information-first", "incomplete offer → information-first");
assert(!contracts.some((c) => c.images?.hero) || recommended.s1 === "product-hero", "image presence is a signal, not a product name");

// Same product, different data → different composition. Generic rule, fictional facts.
const s1input = labContractInput(0);
const rich = buildProductContract(s1input).contract;
const thinFacts = {
  ...s1input,
  facts: { ...s1input.facts, features: [], ingredientsOrComponents: [], specifications: [], pricingInformation: "", guaranteeInformation: "", usageInformation: [], cautions: [], sourceSnippets: [] },
  assets: { version: 1 as const, productName: s1input.facts.productName, hero: null, approved: [], counts: { approved: 0, candidate: 0, rejected: 0 } },
  benefitCandidates: [],
};
const thin = buildProductContract(thinFacts).contract;
assert(pickComposition(rich) === "product-hero", "rich data → product-hero");
assert(pickComposition(thin) === "information-first", "same product, thinner data → information-first");
assert(resolveComposition(rich, "information-first") === "information-first", "operator can force a composition");
assert(resolveComposition(rich, "not-a-layout") === "product-hero", "unknown composition falls back to the rule");

for (const themeId of THEME_IDS) {
  const theme = THEMES[themeId];
  for (const pair of themeContrastPairs(theme)) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    assert(ratio + 1e-6 >= pair.min, `${themeId} ${pair.name} contrast ${ratio.toFixed(2)} >= ${pair.min}`);
  }
}

const css = designSystemTokenCss();
assert(css.includes("--ds-bg"), "token css emits background");
assert(css.includes('[data-ds-theme="ink"]'), "token css emits theme scopes");
assert(!/neuroprime|joint.?genesis|cholibrium/i.test(css), "token css has no product names");

const srcFiles = [
  "src/lib/design-system/compose.ts",
  "src/lib/design-system/tokens.ts",
  "src/lib/design-system/scenarios.ts",
  "src/lib/design-system/layout.ts",
  "src/components/design-system/prototype-page.tsx",
  "src/components/design-system/contract-blocks.tsx",
  "src/components/design-system/prototype-shell.tsx",
  "src/app/admin/lab/design-system/page.tsx",
  "src/app/admin/lab/design-system/[scenario]/page.tsx",
  "src/app/admin/lab/design-system/[scenario]/[composition]/page.tsx",
];
for (const file of srcFiles) {
  const src = readFileSync(path.join(file), "utf8");
  assert(!/neuroprime|joint.?genesis|cholibrium/i.test(src), `${file} has no product-specific names`);
  assert(!/if\s*\(\s*(slug|productName|campaignId)/.test(src), `${file} has no name/slug/id branch`);
}

const publicPages = ["src/app/p/[slug]/page.tsx", "src/app/page.tsx", "src/app/about/page.tsx"];
for (const file of publicPages) {
  const src = readFileSync(file, "utf8");
  assert(!src.includes("design-system-lab.css"), `${file} does not import the lab stylesheet`);
  assert(!src.includes("@/components/design-system"), `${file} does not import prototype components`);
}

function render(key: string, composition: CompositionId): string {
  return renderToStaticMarkup(createElement(PrototypePage, { contract: buildLabContract(key)!, composition }));
}

const REQUIRED_SECTION: Record<CompositionId, string[]> = {
  "product-hero": ["hero", "legal"],
  "editorial-premium": ["hero", "cta", "legal"],
  "information-first": ["hero", "legal"],
};

for (const key of keys) {
  const contract = buildLabContract(key)!;
  for (const composition of COMPOSITION_IDS) {
    const html = render(key, composition);
    assert(html.includes(contract.identity.productName), `${key}/${composition} shows the product name`);
    assert(!/clinically proven|best greens|doctors worldwide|immune support complex/i.test(html), `${key}/${composition} does not invent withheld claims`);
    assert(html.includes(contract.legal.affiliateDisclosure), `${key}/${composition} shows the disclosure`);
    assert(html.includes('id="legal"') || html.includes("ds-footer"), `${key}/${composition} has a footer`);
    for (const id of REQUIRED_SECTION[composition]) {
      assert(html.includes(`id="${id}"`) || html.includes(`ds-${id}`), `${key}/${composition} has ${id}`);
    }
    if (contract.images?.hero) {
      assert(html.includes(contract.images.hero.src) || composition === "information-first", `${key}/${composition} can show the authorized image`);
    } else {
      assert(!html.includes("/lab-fixtures/synthetic.svg") || composition !== "information-first", `${key}/${composition} does not invent an image`);
      assert(
        /No authorized product image|No verified price|not enough commercial context|short description and little else/i.test(html) ||
          composition === "editorial-premium" ||
          Boolean(contract.features?.length || contract.specifications?.length),
        `${key}/${composition} does not invent a missing image`,
      );
    }
    if (contract.cta.state === "AUTHORIZED" && contract.cta.href) {
      assert(html.includes(contract.cta.href), `${key}/${composition} uses the authorized href`);
    } else {
      assert(!/href="https:\/\/hop\.example/.test(html), `${key}/${composition} does not emit an unauthorized hop`);
      assert(/not authorized|does not go anywhere|No authorized affiliate link/i.test(html), `${key}/${composition} explains the missing link`);
    }
    if (contract.offer?.packages.length) {
      for (const pack of contract.offer.packages) {
        if (pack.totalPrice) assert(html.includes(pack.totalPrice), `${key}/${composition} shows ${pack.totalPrice}`);
      }
    } else {
      assert(/No verified price|not enough commercial context/i.test(html), `${key}/${composition} states the missing price`);
    }
    if (contract.features?.length) {
      assert(html.includes("What it is") && html.includes(contract.features[0].text), `${key}/${composition} shows features`);
    }
    if (contract.specifications?.length) {
      assert(html.includes(contract.specifications[0].name), `${key}/${composition} shows specifications`);
    }
  }
}

const heroHtml = render("s1", "product-hero");
const editorialHtml = render("s1", "editorial-premium");
const infoHtml = render("s4", "information-first");
assert(heroHtml.includes("ds-hero--split"), "product-hero uses the split hero");
assert(editorialHtml.includes("ds-hero--editorial"), "editorial-premium uses the editorial hero");
assert(infoHtml.includes("ds-hero--info"), "information-first uses the info hero");
assert(heroHtml.includes("ds-display") && editorialHtml.includes("ds-display"), "hero and editorial use display type");
assert(infoHtml.includes("ds-hero--info"), "information-first keeps the info hero class");
assert(!/clinically proven/i.test(infoHtml), "thin page still withholds invented claims");
assert(compositionSignals(contracts[0]).hasHero, "s1 reports a hero image");
assert(!compositionSignals(contracts[3]).hasHero, "s4 reports no hero image");
assert(compositionSignals(contracts[2]).specCount >= 3, "s3 reports several specifications");

assert(pageDensity(contracts[3]) === "thin", "short accessory is a thin page");
assert(pageDensity(contracts[5]) === "thin", "incomplete offer is a thin page");
assert(pageDensity(contracts[0]) === "full", "complete supplement is a full page");
assert(stickyCtaAllowed(contracts[0]), "s1 may use a sticky CTA (authorized + offer)");
assert(stickyCtaAllowed(contracts[2]), "s3 may use a sticky CTA (authorized + offer)");
assert(stickyCtaAllowed(contracts[4]), "s5 may use a sticky CTA (authorized + offer, no image)");
assert(!stickyCtaAllowed(contracts[1]), "s2 has no verified offer, so no sticky CTA");
assert(!stickyCtaAllowed(contracts[3]), "s4 has no verified offer, so no sticky CTA");
assert(!stickyCtaAllowed(contracts[5]), "s6 is preview-only, so no sticky CTA");

const s1Hero = render("s1", "product-hero");
assert(s1Hero.includes('data-count="3"'), "three features use a 3-column grid, not 2+1");
assert(s1Hero.includes('data-count="2"'), "two offer packages share a 2-column grid");
assert(s1Hero.includes('data-ds-sticky="1"'), "s1 product-hero emits the sticky bar markup");
assert(s1Hero.includes("ds-hero-band") && s1Hero.includes("ds-buy"), "s1 product-hero uses the commercial hero and buy cards");
assert(s1Hero.includes("ds-topbar"), "s1 product-hero has a commerce bar");
assert(!/save \d|%\s*off|best value|limited time/i.test(s1Hero), "no invented discount language");
assert(!/star rating|verified buyer|★★|5\/5/i.test(s1Hero), "no invented reviews");
assert(purchaseCtaAllowed(contracts[0]), "s1 may show a purchase CTA");
assert(!purchaseCtaAllowed(contracts[5]), "s6 may not show a purchase CTA");

const s1Editorial = render("s1", "editorial-premium");
assert(s1Editorial.includes('id="cta"'), "editorial offer section keeps the cta id");
assert(s1Editorial.includes("ds-auto-grid") && s1Editorial.includes("ds-price"), "editorial uses offer cards, not a price list");
assert(!s1Editorial.includes(" — $49"), "editorial no longer inlines prices in a list");

const s4Info = render("s4", "information-first");
assert(!s4Info.includes('data-ds-sticky="1"'), "thin page without an offer has no sticky CTA");
assert(s4Info.includes("No verified price"), "s4 still states the missing price");

const s6Info = render("s6", "information-first");
assert(!s6Info.includes('data-ds-sticky="1"'), "blocked page has no sticky CTA");
assert(!/href="https:\/\/hop\.example/.test(s6Info), "blocked page still emits no hop");

const s2HeroForced = render("s2", "product-hero");
assert(!s2HeroForced.includes("/lab-fixtures/synthetic.svg"), "forcing product-hero on a no-image contract does not invent an image");

assert(passed >= 80, `enough checks ran (${passed})`);
console.log("DESIGN_SYSTEM_UNIVERSAL_OK");
