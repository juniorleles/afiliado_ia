// npx tsx scripts/test-phase-8-1.ts
import { deflateSync } from "node:zlib";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan, applyActionCodes } from "../src/lib/design/planner.ts";
import {
  DESIGN_PLAN_VERSION,
  HERO_VARIANTS,
  SECTION_VARIANTS,
  parseDesignPlan,
  serializeDesignPlan,
  packshotAvailable,
} from "../src/lib/design/plan.ts";
import { assertNoCopyRewrite, assertNoFactualRewrite, presentationFields } from "../src/lib/design/optimize.ts";
import { classifyAssetCandidate, pickBestPackshot } from "../src/lib/assets/classify.ts";
import { discoverSourceAssets, summarizeDiscovery, normalizeImageUrl } from "../src/lib/assets/discover.ts";
import { inspectImageQuality, sniffImageMime, looksLikeHtmlOrScript, readImageDimensions } from "../src/lib/assets/quality.ts";
import { parseAssetRoleResponse, assetRoleClassifierPrompt } from "../src/lib/assets/vision.ts";
import { validateManualProductUpload, storeManualProductImage } from "../src/lib/product-image.ts";
import { acquireBestProductAsset } from "../src/lib/assets/acquire.ts";
import { probeRemoteImage } from "../src/lib/assets/probe.ts";
import { isUnusableProductAspect } from "../src/lib/presell-display.ts";
import { ANALYTICS_SKIP_HEADER } from "../src/lib/analytics.ts";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function solidPng(width: number, height: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = 18;
      row[2 + x * 3] = 92;
      row[3 + x * 3] = 84;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "IMPORTED");
facts.description = "a mid-weight insulated layer for daily cold weather";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Water-resistant shell", "Insulated core"];
facts.confidence.features = "DIRECT_SOURCE";
facts.usageInformation = ["Machine-wash the outer shell"];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.guaranteeInformation = "30-day returns through the merchant";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Shell", "Fill", "Lining"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";
const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Price",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell

## Ingredients

- Shell
- Fill
- Lining

## How to Use

- Machine-wash the outer shell

## Things to Consider

- Fit can run large

## Guarantee

30-day returns through the merchant

## FAQ

- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option for ordinary winter days.
`,
};
const page = composePresellPage({ variant, facts, template: "BUYER_GUIDE" });

assert(DESIGN_PLAN_VERSION === 2, "DesignPlan V2");
assert(HERO_VARIANTS.includes("PRODUCT_STAGE"), "PRODUCT_STAGE hero");
assert(HERO_VARIANTS.includes("MAGAZINE_PRODUCT"), "MAGAZINE_PRODUCT hero");
assert(HERO_VARIANTS.includes("MINIMAL_LUXURY"), "MINIMAL_LUXURY hero");
assert(SECTION_VARIANTS.includes("INGREDIENT_EDITORIAL_GRID"), "ingredient editorial grid");
assert(SECTION_VARIANTS.includes("WIDE_GUARANTEE_STATEMENT"), "wide guarantee");

const missing = createDesignPlan({ page, theme: "PREMIUM", productAssetStatus: "NEEDS_ASSET" });
assert(missing.productAssetStatus === "NEEDS_ASSET", "product asset status NEEDS_ASSET");
assert(missing.heroVariant === "MINIMAL_LUXURY" || missing.heroVariant === "MAGAZINE_PRODUCT", "missing-packshot hero strategy");
assert(missing.productVisualStrategy === "FALLBACK_COMPOSE", "missing packshot is editorial-first");
assert(!packshotAvailable(missing), "packshotAvailable false when missing");
assert(missing.tokens.heroScale === "luxury" || missing.tokens.heroScale === "editorial", "art direction tokens V2 heroScale");
assert(missing.tokens.displayScale === "expressive", "expressive display scale");
assert(missing.tokens.contentRhythm === "story", "section rhythm is story");
assert(new Set(missing.sectionPlans.map((s) => s.band)).size >= 3, "section rhythm uses multiple bands");
assert(missing.sectionPlans.some((s) => s.variant === "INGREDIENT_EDITORIAL_GRID" || s.variant === "INGREDIENT_ORBIT"), "ingredient art direction");
assert(missing.sectionPlans.some((s) => s.variant === "VISUAL_NUMBER_STEP"), "visual number step");
assert(missing.sectionPlans.some((s) => s.variant === "WIDE_GUARANTEE_STATEMENT"), "guarantee V2");

const ready = createDesignPlan({
  page: {
    ...page,
    hero: { ...page.hero, image: { src: "/media/product/pack.png", alt: "product pack", provenance: "MANUAL" } },
  },
  theme: "PREMIUM",
  productAssetStatus: "READY",
  productAssetProvenance: "MANUAL",
});
assert(ready.productAssetStatus === "READY", "READY when packshot exists");
assert(ready.heroVariant === "PRODUCT_STAGE" || ready.heroVariant === "PRODUCT_CANVAS" || ready.heroVariant === "ASYMMETRIC_EDITORIAL", "real-packshot hero strategy");
assert(ready.tokens.imageOverlap === true, "packshot allows overlap");
assert(ready.productAssetProvenance === "MANUAL", "manual provenance retained");

const v1 = parseDesignPlan(
  JSON.stringify({
    version: 1,
    visualTheme: "PREMIUM",
    artDirection: "legacy",
    heroVariant: "EDITORIAL_SPLIT",
    typographyScale: "confident",
    spacingDensity: "generous",
    contentWidth: "wide",
    sectionPlans: missing.sectionPlans.map(({ band: _band, ...rest }) => rest),
    productVisualStrategy: "FALLBACK_COMPOSE",
    backgroundRhythm: "alternating",
    ctaStrategy: missing.ctaStrategy,
    mobileStrategy: { productAboveText: true, collapseSecondary: true, stackBento: true },
    decorativeAssets: true,
    appliedActionCodes: [],
    themeLocked: false,
  }),
);
assert(v1?.version === 2, "v1 DesignPlan upgrades to v2");
assert(v1?.tokens.sectionSpacing, "upgraded plan has V2 tokens");

assert(parseDesignPlan(serializeDesignPlan(missing))?.heroVariant === missing.heroVariant, "DesignPlan V2 roundtrip");

const mapped = applyActionCodes(structuredClone(missing), ["CREATE_HERO_FOCAL_POINT", "ACQUIRE_PRODUCT_IMAGE", "IMPROVE_TYPE_SCALE"], page);
assert(mapped.heroVariant === "MAGAZINE_PRODUCT", "Visual QA maps missing packshot to MAGAZINE_PRODUCT");
assert(mapped.tokens.displayScale === "expressive", "type scale action keeps expressive display");

const pack = classifyAssetCandidate({ url: "https://cdn.example.com/product-pack.png", alt: "product pack", width: 800, height: 1000 });
assert(pack.role === "PRODUCT_PACKSHOT", "packshot candidate role");
assert(!pack.rejected, "packshot not rejected");

const cta = classifyAssetCandidate({ url: "https://cdn.example.com/order-now-banner.png", alt: "ORDER NOW" });
assert(cta.rejected && cta.role === "UNUSABLE", "CTA/banner rejection");

const logo = classifyAssetCandidate({ url: "https://cdn.example.com/brand-logo.svg", alt: "logo" });
assert(logo.role === "BRAND_LOGO", "logo is not treated as packshot");

const pixel = classifyAssetCandidate({ url: "https://t.co/pixel.gif" });
assert(pixel.rejectReason === "tracking-pixel", "tracking pixel rejected");

const html = `<html><head>
<meta property="og:image" content="https://cdn.example.com/order-now-banner.png">
<meta name="twitter:image" content="https://cdn.example.com/product-pack.png">
</head><body>
<img src="https://cdn.example.com/icon-facebook.png" class="social-icon" alt="facebook">
<img src="https://cdn.example.com/pack-hero.png" alt="product bottle" width="800" height="1000">
<footer><img src="https://cdn.example.com/footer-badge.png" alt="payment badge visa"></footer>
</body></html>`;
const discovered = discoverSourceAssets(html, "https://example.com/jacket");
const summary = summarizeDiscovery(discovered);
assert(summary.total >= 4, "asset discovery finds multiple candidates");
assert(summary.rejected >= 2, "CTA/banner/icon/footer rejected");
const best = pickBestPackshot(discovered);
assert(Boolean(best?.url.includes("pack")), "best packshot candidate is a product image");
assert(best?.provenance === "DIRECT_SOURCE", "discovered assets keep DIRECT_SOURCE provenance");
assert(best?.classificationMethod === "DETERMINISTIC", "deterministic classification method");

const quality = inspectImageQuality({ width: 120, height: 140 });
assert(quality.some((item) => item.code === "PIXELATED_PACKSHOT"), "tiny source is not called high quality");
assert(inspectImageQuality({ width: 1600, height: 400 }).some((item) => item.code === "BANNER_LIKE"), "banner-like finding");

const prompt = assetRoleClassifierPrompt();
assert(prompt.question === "What role does this image appear to serve?", "allowed AI question");
assert(prompt.forbidden.includes("medical efficacy"), "AI must not infer efficacy");
assert(parseAssetRoleResponse("This looks like a PRODUCT_PACKSHOT photo.") === "PRODUCT_PACKSHOT", "AI role parse");
assert(parseAssetRoleResponse("unclear") === "UNCERTAIN", "uncertain role");

const png = solidPng(80, 100);
assert(sniffImageMime(png) === "image/png", "valid png sniff");
assert(validateManualProductUpload(png, "image/png").ok === true, "manual jpeg/png/webp validation accepts png");
assert(validateManualProductUpload(Buffer.from("<script>alert(1)</script>"), "text/html").ok === false, "html/script rejected");
assert(looksLikeHtmlOrScript(Buffer.from("<!doctype html><html>")), "html detected");
assert(validateManualProductUpload(Buffer.alloc(3_000_000), "image/png").ok === false, "oversize rejected");
const stored = storeManualProductImage(png, "image/png");
assert(stored?.provenance === "MANUAL", "manual image provenance");
assert(Boolean(stored?.src.startsWith("/media/product/")), "manual image uses local product store");

const src = {
  page: readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8"),
  css: readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8"),
  stage: readFileSync(path.join(process.cwd(), "src/components/presell/product-stage.tsx"), "utf8"),
  empty: readFileSync(path.join(process.cwd(), "src/components/presell/empty-asset-hero.tsx"), "utf8"),
  panel: readFileSync(path.join(process.cwd(), "src/components/admin/design-studio-panel.tsx"), "utf8"),
  cta: readFileSync(path.join(process.cwd(), "src/components/presell/presell-cta.tsx"), "utf8"),
  opt: readFileSync(path.join(process.cwd(), "src/lib/design/optimize.ts"), "utf8"),
  hop: readFileSync(path.join(process.cwd(), "src/lib/clickbank-hop.ts"), "utf8"),
};
assert(src.stage.includes("object-fit: contain") || src.stage.includes("ps-product-stage-img"), "ProductStage present");
assert(src.empty.includes("data-placeholder"), "empty-asset hero is intentional, not a black fake pack");
assert(src.empty.includes("Product image not available"), "empty-asset language is neutral");
assert(!src.empty.includes("Official product packshot"), "empty-asset does not imply official authority");
assert(!src.empty.includes("bg-zinc-900"), "empty-asset does not use giant black card");
assert(src.css.includes("ps-hero-magazine-grid"), "premium hero engine V2");
assert(src.css.includes('"eyebrow"'), "mobile hero composition uses explicit areas");
assert(src.css.includes("78rem"), "desktop uses a wide premium shell");
assert(src.panel.includes("PRODUCT PACKSHOT REQUIRED"), "admin missing-asset message");
assert(src.panel.includes("Upload Product Image"), "manual upload action");
assert(src.panel.includes("Apply Premium Design"), "apply premium design action");
assert(src.cta.includes("AffiliateCta"), "CTA tracking reuse");
assert(!src.opt.includes("publishCampaign"), "no auto-publish");
assert(src.hop.includes("extclid"), "extclid regression");
assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics", "preview analytics skip header");

const before = {
  headline: "A",
  body: "B",
  ctaLabel: "C",
  affiliateUrl: "https://example.com/hop",
  pageComposition: "{\"v\":1}",
} as never;
assertNoFactualRewrite(before, { ...before });
let threw = false;
try {
  assertNoFactualRewrite(before, { ...before, headline: "changed" });
} catch {
  threw = true;
}
assert(threw, "no factual mutation");
assertNoCopyRewrite(before, { ...before, pageComposition: "{\"hero\":{}}" } as never);

const missingHtmlDims = classifyAssetCandidate({
  url: "https://cdn.example.com/product-bottle.png",
  alt: "product bottle",
  width: 0,
  height: 0,
});
assert(missingHtmlDims.rejected === false, "0x0 metadata not automatically rejected");
assert(missingHtmlDims.role === "PRODUCT_PACKSHOT", "bottle filename still classifies without HTML dimensions");
assert(isUnusableProductAspect(0, 0) === false, "unknown aspect is not treated as a banner");

const square = classifyAssetCandidate({
  url: "https://cdn.example.com/product-image.png",
  alt: "official product image",
  width: 800,
  height: 800,
});
assert(square.role === "PRODUCT_PACKSHOT" && square.rejected === false, "square product imagery is a valid packshot");

const lifestyle = classifyAssetCandidate({
  url: "https://cdn.example.com/product-bottle-herbs.png",
  alt: "product bottle with botanical ingredients",
  width: 900,
  height: 1100,
});
assert(lifestyle.role === "PRODUCT_LIFESTYLE" && lifestyle.rejected === false, "product + decorative ingredient imagery is lifestyle");

const chrome = classifyAssetCandidate({
  url: "https://cdn.example.com/daily-formula.png",
  alt: "daily formula",
  parentHint: '<div class="container mx-auto">',
  width: 0,
  height: 0,
});
assert(chrome.role !== "PRODUCT_PACKSHOT", "Bootstrap container parentHint is not a packshot signal");

const lazyHtml = `<html><body>
<img data-src="/images/product-bottle.png" alt="product bottle">
<img data-lazy-src="/images/lazy-pack.png" alt="product pack">
<img data-original="/images/original-shot.png" alt="product shot">
<img src="pixel.gif" width="1" height="1" alt="">
</body></html>`;
const lazyFound = discoverSourceAssets(lazyHtml, "https://shop.example.com/item");
assert(lazyFound.some((item) => item.source === "lazy" && item.url.endsWith("/images/product-bottle.png")), "lazy-loaded data-src is discovered");
assert(lazyFound.some((item) => item.url.endsWith("/images/lazy-pack.png")), "data-lazy-src is discovered");
assert(lazyFound.some((item) => item.url.endsWith("/images/original-shot.png")), "data-original is discovered");

const relative = normalizeImageUrl("../img/product-bottle.png", "https://shop.example.com/p/item");
assert(relative === "https://shop.example.com/img/product-bottle.png", "relative URLs resolve against the source page");
assert(
  normalizeImageUrl("//cdn.example.com/product-bottle.png", "https://shop.example.com/p") ===
    "https://cdn.example.com/product-bottle.png",
  "protocol-relative URLs resolve",
);

const srcsetHtml = `<img src="/img/bottle-small.png" srcset="/img/product-bottle-400.png 400w, /img/product-bottle-1200.png 1200w" alt="product bottle">`;
const srcsetFound = discoverSourceAssets(srcsetHtml, "https://shop.example.com/");
assert(
  srcsetFound.some((item) => item.source === "srcset" && item.url.endsWith("/img/product-bottle-1200.png")),
  "srcset prefers the widest candidate",
);

const pictureHtml = `<picture><source srcset="/img/product-bottle.webp 800w, /img/product-bottle-1600.webp 1600w"><img src="/img/product-bottle.png" alt="product bottle"></picture>`;
const pictureFound = discoverSourceAssets(pictureHtml, "https://shop.example.com/");
assert(
  pictureFound.some((item) => item.source === "picture" && item.url.endsWith("/img/product-bottle-1600.webp")),
  "picture/source srcset is discovered",
);

const decoded = readImageDimensions(solidPng(640, 800));
assert(decoded?.width === 640 && decoded.height === 800, "real decoded dimensions are read from the image bytes");

assert(parseAssetRoleResponse("I would call this a PRODUCT_LIFESTYLE composition.") === "PRODUCT_LIFESTYLE", "multimodal role parse fallback");

async function withAssetServer<T>(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, png: Buffer) => void,
  run: (base: string, png: Buffer) => Promise<T>,
): Promise<T> {
  const png = solidPng(800, 800);
  const server = http.createServer((req, res) => handler(req, res, png));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}`, png);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function testAcquisitionPipeline() {
  await withAssetServer(
    (req, res, png) => {
      const url = req.url || "/";
      if (url.startsWith("/redir")) {
        res.writeHead(302, { location: "/product-bottle.png" });
        res.end();
        return;
      }
      if (url.startsWith("/extless") || url.startsWith("/octet")) {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(png);
        return;
      }
      if (url.includes("product-bottle") || url.includes("hero-item") || url.endsWith(".png")) {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(png);
        return;
      }
      res.writeHead(404);
      res.end("missing");
    },
    async (base) => {
      const redirected = await probeRemoteImage(`${base}/redir`);
      assert(Boolean(redirected && redirected.width === 800 && redirected.height === 800), "redirected images are followed and decoded");
      assert(redirected?.finalUrl.includes("product-bottle.png") === true, "redirect final URL is captured");

      const octet = await probeRemoteImage(`${base}/extless`);
      assert(octet?.mime === "image/png" && octet.width === 800, "content-type based image detection uses magic bytes");

      const html = `<html><body>
        <div class="container">
          <img src="${base}/order-now.png" alt="ORDER NOW">
          <img data-src="${base}/product-bottle.png" alt="product bottle">
          <img src="${base}/hero-item.png">
        </div>
      </body></html>`;
      const acquired = await acquireBestProductAsset(html, `${base}/source`);
      assert(acquired.discovered.length >= 3, "acquisition discovers source candidates");
      assert(acquired.downloaded >= 1, "unknown-dimension candidates are downloaded");
      assert(acquired.withRealDimensions >= 1, "downloaded candidates expose real decoded dimensions");
      assert(acquired.packshotCandidates.length >= 1, "packshot candidates exist after probing");
      assert(acquired.rejected.some((item) => /order-now/i.test(item.url)), "banner rejection remains");
      assert(acquired.selected?.provenance === "DIRECT_SOURCE", "DIRECT_SOURCE provenance is kept after classification");
      assert(acquired.selected?.role === "PRODUCT_PACKSHOT" || acquired.selected?.role === "PRODUCT_LIFESTYLE", "selected role is a product visual");
      assert(Boolean(acquired.selected?.localPath.startsWith("/media/product/")), "selected asset is materialized locally");
      assert(acquired.selected?.width === 800 && acquired.selected?.height === 800, "selected asset uses decoded dimensions");
      assert(
        acquired.selected?.classificationMethod === "DETERMINISTIC" || acquired.selected?.classificationMethod === "AI_CLASSIFIED",
        "multimodal classification fallback stays optional",
      );
    },
  );
}

testAcquisitionPipeline()
  .then(() => {
    console.log("\nTodos os testes da Phase 8.1 passaram.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
