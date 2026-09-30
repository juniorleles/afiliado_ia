// npx tsx scripts/test-visual-identity.ts
import { contrastRatio, parseColor } from "../src/lib/visual-identity/color.ts";
import { extractVisualIdentity, isFrameworkStylesheet, presentationStyle, sampleImageColors, shouldSampleAsset } from "../src/lib/visual-identity/extract.ts";
import { displayedIngredientCards, representedIngredientFacts } from "../src/lib/presell-ingredient-display.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const html = `<!doctype html>
<html><head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="brand.css">
</head><body>
<header id="header"><a class="btn_primary">Order</a><a class="btn_primary">Order</a></header>
<section class="banner">One</section>
<section class="banner">Two</section>
<footer class="banner">End</footer>
<p class="txt_ink">Copy</p><p class="txt_ink">Copy</p><p class="txt_ink">Copy</p>
</body></html>`;

const css = `:root {
  --ink: #10233F;
  --paper: #E7F0EA;
  --cta: #C47A12;
  --unused: #FF00AA;
}
#header { background: var(--ink); }
.banner { background: var(--paper); }
.btn_primary { background: var(--cta); color: var(--ink); }
.txt_ink { color: var(--ink); }
.ghost { background: var(--unused); }
`;

const identity = extractVisualIdentity({
  sourceUrl: "https://example.com/harbor",
  html,
  stylesheets: [{ url: "https://example.com/brand.css", css }],
});
assert(Boolean(identity), "a page with repeated brand signals yields an identity");
assert(identity?.background === "#E7F0EA", "repeated section background becomes the page ground");
assert(identity?.accent === "#C47A12", "repeated CTA fill becomes the accent");
assert(identity?.primary === "#10233F", "repeated brand ink becomes primary");
assert(identity?.accent !== "#FF00AA", "an unused class does not supply the accent");
assert(isFrameworkStylesheet("https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"), "bootstrap is not a brand stylesheet");
assert(!identity?.stylesheetUrls.some((url) => url.includes("bootstrap")), "framework sheets are not provenance");

const paper = parseColor(identity!.applied.background)!;
const label = parseColor(identity!.applied.ctaLabel)!;
const fill = parseColor(identity!.applied.accent)!;
const text = parseColor(identity!.applied.text)!;
assert(contrastRatio(label, fill) >= 4.5, "CTA label contrasts with the accent fill");
assert(contrastRatio(text, paper) >= 4.5, "body text contrasts with the background");
assert(identity?.productImageSignal === null, "no packshot leaves the image signal empty");

const pixels = Buffer.alloc(40 * 40 * 4);
for (let i = 0; i < 40 * 40; i += 1) {
  const offset = i * 4;
  const isolated = i < 20;
  pixels[offset] = isolated ? 220 : 20;
  pixels[offset + 1] = isolated ? 20 : 70;
  pixels[offset + 2] = isolated ? 20 : 140;
  pixels[offset + 3] = 255;
}
const sampled = sampleImageColors(pixels, 40, 40);
assert(sampled !== "#DC1414" && sampled !== null, "an isolated red bin does not dominate the packshot signal");
assert(shouldSampleAsset({ url: "star-marker.svg", className: "star-marker" }) === false, "a decorative marker is not a palette source");
assert(shouldSampleAsset({ url: "starter-product.png", width: 640, height: 800 }) === true, "a package raster can contribute a color signal");

const facts = ["Northwind Leaf", "Trail Root", "Copper", "Harbor Seed", "Zinc", "Rutin", "Lutein", "Bilberry"];
const cards = facts.map((title) => ({ title, body: "" }));
const display = displayedIngredientCards(cards, 6, true);
assert(display.shown.length === facts.length && display.withheld.length === 0, "a lead cap does not hide ingredient rows");
assert(display.shown.every((card) => card.body === ""), "ingredient rows do not gain invented descriptions");
const coverage = representedIngredientFacts(display.shown.map((card) => card.title), facts);
assert(coverage.missing.length === 0 && coverage.represented.length === facts.length, "every authorized ingredient fact is represented");
const hidden = representedIngredientFacts(cards.slice(0, 6).map((card) => card.title), facts);
assert(hidden.missing.length === 2, "a six-row cap leaves later facts unrepresented");

const goldHtml = `<!doctype html><body>
<header id="header"></header><header id="header"></header>
<a class="btn_primary">Offer</a><a class="btn_primary">Offer</a>
<section class="banner">A</section><section class="banner">B</section><footer class="banner">C</footer>
<p class="txt_ink">A</p><p class="txt_ink">B</p><p class="txt_ink">C</p>
<section class="bg_mint">D</section><section class="bg_mint">E</section>
</body>`;
const goldCss = `#header { background: #120852; color: #f8fafc; }
.btn_primary { background: #FFB549; color: #120852; }
.banner { background: #DBE8FF; }
.txt_ink { color: #120852; }
.bg_mint { background: #5AD05A; }`;
const gold = extractVisualIdentity({
  sourceUrl: "https://example.com/harbor-gold",
  html: goldHtml,
  stylesheets: [{ url: "https://example.com/brand.css", css: goldCss }],
});
assert(Boolean(gold), "a light gold CTA palette still yields an identity");
const style = presentationStyle(gold!);
function pair(fgKey: string, bgKey: string): number {
  return contrastRatio(parseColor(style[fgKey])!, parseColor(style[bgKey])!);
}
assert(pair("--ps-text", "--ps-bg") >= 4.5, "headings clear the page ground");
assert(pair("--ps-text", "--ps-surface") >= 4.5, "headings clear the card surface");
assert(pair("--ps-text", "--ps-surface-strong") >= 4.5, "headings clear the strong surface");
assert(pair("--ps-text-muted", "--ps-bg") >= 4.5, "secondary text clears the page ground");
assert(pair("--ps-text-muted", "--ps-surface") >= 4.5, "secondary text clears the card surface");
assert(pair("--ps-label", "--ps-surface") >= 4.5, "numbered labels clear the card surface");
assert(style["--ps-label"] !== style["--ps-brand-accent"] || pair("--ps-brand-accent", "--ps-surface") >= 4.5, "a light brand accent is not used as label text");
assert(pair("--ps-cta-label", "--ps-cta-bg") >= 4.5, "CTA text clears the CTA fill");
assert(pair("--ps-on-accent", "--ps-accent-strong") >= 4.5, "guarantee text clears the strong brand fill");
assert(style["--ps-brand-accent"] === "#FFB549", "the brand accent itself stays the source gold");
assert(style["--ps-brand-primary"] === "#120852", "the brand primary stays the source navy");
