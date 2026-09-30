// npx tsx scripts/test-portal-legal-v1.ts
// Portal + legal/institutional pages. Fictional products only; temp DB.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDbPath, resetDbForTests } from "../src/lib/db.ts";
import { createCampaign, publishCampaign, unpublishCampaign, getCampaignBySlug } from "../src/lib/campaigns.ts";
import { readyPublicationInput } from "./fixtures/ready-publication-campaign.ts";
import { collectEnvIssues } from "../src/lib/env.ts";
import { publishedReviewCards } from "../src/lib/portal/reviews.ts";
import { PORTAL_LEGAL_LINKS, PORTAL_NAV_LINKS, PUBLIC_FOOTER_LINKS, getPublicContactEmail } from "../src/lib/public-site.ts";
import { consumerFacingFaqQuestion } from "../src/lib/presell-section-labels.ts";
import sitemap from "../src/app/sitemap.ts";

let passed = 0;
function assert(cond: boolean, msg: string, detail?: unknown) {
  if (!cond) throw new Error("FALHOU: " + msg + (detail === undefined ? "" : ` ${JSON.stringify(detail)}`));
  passed += 1;
  console.log("OK: " + msg);
}

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-portal-"));
const saved = { db: process.env.PRESELL_OS_DB, site: process.env.PUBLIC_SITE_URL, email: process.env.PUBLIC_CONTACT_EMAIL };

function input(slug: string, _headline: string, subheadline: string) {
  return readyPublicationInput({
    name: `Fictional ${slug}`,
    slug,
    subheadline,
    affiliateUrl: "https://fictional.hop.clickbank.net/?tid=x",
  });
}

try {
  resetDbForTests();
  process.env.PRESELL_OS_DB = path.join(tmp, "portal.db");
  if (path.resolve(getDbPath()) === path.resolve("data", "presell-os.db")) throw new Error("refusing real DB");
  process.env.PUBLIC_SITE_URL = "https://fictional-portal.example";

  // ---- Catalog: published only, generic ------------------------------------------------------
  assert(publishedReviewCards().length === 0, "empty catalog before any publish");
  const lamp = createCampaign(input("fictional-desk-lamp", "Fictional Desk Lamp", "A desk lamp the seller describes as dimmable."));
  const kettle = createCampaign(input("fictional-travel-kettle", "Fictional Travel Kettle", "A folding kettle listed by its seller."));
  const draft = createCampaign(input("fictional-draft-blender", "Fictional Draft Blender", "Draft only."));
  const legacy = createCampaign({ ...input("fictional-legacy-backfill", "Fictional Legacy Backfill", "Backfilled without a source snapshot."), sourceFactsJson: null });
  publishCampaign(lamp.id);
  publishCampaign(kettle.id);
  let legacyRefused = false;
  try {
    publishCampaign(legacy.id);
  } catch {
    legacyRefused = true;
  }
  assert(legacyRefused, "a row without source facts cannot become published");
  assert(getCampaignBySlug(legacy.slug)?.publicationStatus === "draft", "source-less publish leaves the row a draft");
  const cards = publishedReviewCards();
  assert(cards.length === 2, "only published campaigns are listed", cards.map((c) => c.slug));
  assert(!cards.some((c) => c.slug === draft.slug), "draft never appears");
  assert(!cards.some((c) => c.slug === legacy.slug), "published row without a source snapshot stays out of the catalog");
  assert(cards.every((c) => c.href === `/p/${c.slug}`), "cards link to the public review route");
  assert(cards.find((c) => c.slug === "fictional-desk-lamp")?.summary === "A desk lamp the seller describes as dimmable.", "card restates the page's own copy");
  assert(cards.every((c) => !Object.keys(c).some((key) => /rating|score|stars|rank|popular/i.test(key))), "cards carry no rating/score fields");
  unpublishCampaign(lamp.id);
  assert(publishedReviewCards().map((c) => c.slug).join() === "fictional-travel-kettle", "unpublish removes the card without rebuild");

  // ---- Sitemap ------------------------------------------------------------------------------
  const urls = sitemap().map((entry) => entry.url);
  for (const pathName of ["/", "/reviews", "/editorial-policy", "/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure"]) {
    assert(urls.includes(`https://fictional-portal.example${pathName}`), `sitemap lists ${pathName}`);
  }
  assert(urls.includes("https://fictional-portal.example/p/fictional-travel-kettle"), "sitemap lists the published review");
  assert(!urls.some((u) => u.includes(draft.slug) || u.includes("fictional-desk-lamp") || u.includes(legacy.slug)), "sitemap excludes draft, unpublished, and source-less backfill");
  assert(!urls.some((u) => /\/(admin|preview|visual-frame|api)\b/.test(u)), "sitemap has no internal URLs");

  // ---- Contact is real or absent, never invented --------------------------------------------
  delete process.env.PUBLIC_CONTACT_EMAIL;
  assert(getPublicContactEmail() === null, "no placeholder contact address when unconfigured");
  process.env.PUBLIC_CONTACT_EMAIL = "not-an-email";
  assert(getPublicContactEmail() === null, "malformed contact address is not shown");
  process.env.PUBLIC_CONTACT_EMAIL = "editor@fictional-portal.example";
  assert(getPublicContactEmail() === "editor@fictional-portal.example", "configured contact address is used");
  delete process.env.PUBLIC_CONTACT_EMAIL;
  const contactIssue = collectEnvIssues("production").find((issue) => issue.name === "PUBLIC_CONTACT_EMAIL");
  assert(Boolean(contactIssue) && contactIssue?.fatal === false, "missing contact address is a non-fatal production warning");
} finally {
  resetDbForTests();
  for (const [key, value] of [["PRESELL_OS_DB", saved.db], ["PUBLIC_SITE_URL", saved.site], ["PUBLIC_CONTACT_EMAIL", saved.email]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- Source contracts ----------------------------------------------------------------------
const portalFiles = [
  "src/app/page.tsx",
  "src/app/reviews/page.tsx",
  "src/app/editorial-policy/page.tsx",
  "src/components/portal/portal-shell.tsx",
  "src/components/portal/review-card.tsx",
  "src/lib/portal/reviews.ts",
  "src/components/public-legal-page.tsx",
  "src/app/about/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/affiliate-disclosure/page.tsx",
];
const portalSrc = portalFiles.map(read).join("\n");
assert(!/joint[\s-]?genesis|controlled-ready|\b153\b/i.test(portalSrc), "no product/slug-specific portal logic");
assert(
  !/example\.com|\(\d{3}\)\s?\d{3}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d+\s+\w+\s+(Street|St\.|Avenue|Ave\.|Road|Rd\.|Suite)\b/i.test(portalSrc),
  "no invented contact address, phone, or street address",
);
assert(!/★|☆|\d(\.\d)?\s*\/\s*(5|10)\b|rating=|stars=|bestseller|limited time|only \d+ left|trusted by|\d+[,.]?\d*\+?\s+(readers|customers|reviews)/i.test(portalSrc), "no fake ratings, popularity, or scarcity");
assert(!/\b(cures?|treats?|heals?|clinically proven|guaranteed results)\b/i.test(read("src/app/page.tsx") + read("src/app/reviews/page.tsx") + read("src/components/portal/review-card.tsx")), "portal chrome makes no health claims");
assert(/export const dynamic = "force-dynamic"/.test(read("src/app/page.tsx")), "home reflects the current published set");
assert(/export const dynamic = "force-dynamic"/.test(read("src/app/reviews/page.tsx")), "catalog reflects the current published set");
assert(/listPublishedCampaigns\(\)/.test(read("src/lib/portal/reviews.ts")), "catalog source is the published list");
assert(/isReleasePublication/.test(read("src/lib/portal/reviews.ts")) && /isReleasePublication/.test(read("src/app/sitemap.ts")) && /isReleasePublication/.test(read("src/app/p/[slug]/page.tsx")), "public release requires a source snapshot");
assert(consumerFacingFaqQuestion("What features are described for Fictional Lamp?") === "What are the features of Fictional Lamp?", "feature FAQ question is consumer-facing");
assert(consumerFacingFaqQuestion("How do you take Fictional Lamp?") === "How do you take Fictional Lamp?", "other FAQ questions stay verbatim");

const privacy = read("src/app/privacy/page.tsx");
for (const token of ["aia_sid", "gclid", "fbclid", "msclkid", "utm_source", "extclid", "referring page", "do not necessarily represent individual humans", "does not persist buyer", "no automatic expiry"]) {
  assert(privacy.includes(token), `privacy describes ${token}`);
}
const editorial = read("src/app/editorial-policy/page.tsx");
assert(/AI language models/.test(editorial) && /Nothing is published automatically/.test(editorial), "editorial policy discloses AI drafting and human publication");
assert(/do not currently use or test the products/.test(editorial) && /not laboratory, clinical, or scientific/.test(editorial), "editorial policy disclaims testing");
assert(/not medical advice/i.test(editorial) && /not medical advice/i.test(read("src/app/terms/page.tsx")), "health information disclaimer present");
assert(/commission/.test(read("src/app/affiliate-disclosure/page.tsx")) && /not the manufacturer or seller/.test(read("src/app/affiliate-disclosure/page.tsx")), "disclosure covers commission and non-affiliation with the maker");

// ---- Navigation + LP isolation ---------------------------------------------------------------
assert(PORTAL_NAV_LINKS.map((l) => l.href).join() === "/,/reviews,/about,/editorial-policy", "primary nav: Home, Reviews, About, Editorial Policy");
assert(PORTAL_LEGAL_LINKS.map((l) => l.href).sort().join() === "/affiliate-disclosure,/contact,/privacy,/terms", "legal footer: disclosure, privacy, terms, contact");
const footerHrefs = new Set([...PORTAL_NAV_LINKS, ...PORTAL_LEGAL_LINKS].map((l) => l.href));
assert(PUBLIC_FOOTER_LINKS.every((l) => footerHrefs.has(l.href)), "portal footer covers every presell footer link");
assert(PUBLIC_FOOTER_LINKS.length === 5, "presell footer link set unchanged");
const vm = read("src/components/presell/visual-master-view.tsx") + read("src/components/presell/presell-page-view.tsx") + read("src/app/p/[slug]/page.tsx");
assert(!/portal/i.test(vm), "presell LP does not import portal chrome");
assert(/\.portal\b/.test(read("src/app/portal.css")) && !/^(body|html|h1|h2|a)\s*\{/m.test(read("src/app/portal.css")), "portal CSS is scoped and does not restyle LPs");
assert(/aria-current/.test(read("src/components/portal/portal-shell.tsx")) && /Skip to content/.test(read("src/components/portal/portal-shell.tsx")), "nav marks the current page and offers a skip link");
assert(/:focus-visible/.test(read("src/app/portal.css")) && /min-height: 44px/.test(read("src/app/portal.css")), "visible focus states and 44px tap targets");

console.log(`Portal + legal V1: ${passed} checks passed.`);
