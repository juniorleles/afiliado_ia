# Presell OS — Canonical Roadmap

**This is the canonical roadmap for Presell OS** (this repo: Afiliado IA).

Before implementing a new Presell OS phase, read this roadmap and the
existing project documentation. Never weaken completed safeguards or
silently replace previous architecture.

Related documents (all preserved; do not delete):

| Document | Role |
|---|---|
| `docs/ROADMAP.md` | **Canonical** product roadmap (this file) |
| `docs/ROADMAP_FASES.md` | Original numbered product-phase prompt log (Foundation → Import). Historical; still valid for those phases. |
| `docs/PHASE_1_TRUST_COMPLIANCE.md` | Trust & Compliance implementation notes |
| `docs/PHASE_2_POLICY_LINTER_V2.md` | Policy Linter V2 |
| `docs/PHASE_2_5_PUBLICATION_WORKFLOW.md` | Draft / Review / Publish |
| `docs/PHASE_3_CONTENT_ENGINE_V2.md` | Content Engine V2 |
| `docs/PHASE_4_TRACKING_FOUNDATION.md` | Tracking foundation |
| `docs/PHASE_5_CLICKBANK_ATTRIBUTION.md` | ClickBank INS / `extclid` |
| `docs/CLICKBANK_INTEGRATION_RESEARCH.md` | Official ClickBank mechanism research |
| `docs/PHASE_6_PAGE_BUILDER_V2.md` | Page Builder V2 |
| `docs/PHASE_7_VISUAL_QA.md` | Visual QA Agent |
| `docs/VISUAL_STANDARD.md` | PREMIUM_INTERNATIONAL visual bar |
| `docs/PHASE_8_PAGE_DESIGNER.md` | Intelligent Page Designer |
| `AGENTS.md` | Agent operating rules |

Published presells are **English-only**. The admin panel may be Portuguese.
Keep this repo separate from `mercados-autonomos` and `affiliate-ai-platform`.
Do not clone Flow Pages branding or templates.

---

## How to use this document

1. Read **Core principles** and the **Non-regression contract** before any code change.
2. Confirm the **current phase**. Implement only that phase until the operator validates it in a real environment.
3. Do not start phase N+1 while N is still `IN PROGRESS` or unvalidated.
4. After a phase lands, follow **Roadmap maintenance** at the end of this file.
5. Per-phase `docs/PHASE_*.md` files remain the detailed implementation notes. This roadmap is the map.

---

## Product vision

Presell OS is an automated affiliate presell **creation, validation,
publishing and attribution** platform.

Target operator workflow:

```
Product
→ Import Product Facts
→ Market Research
→ Strategy
→ Generate Content
→ Grounding Validation
→ Policy Validation
→ CONTENT_GATE
→ Page Composition
→ Web Anatomy Audit          (PLANNED — Page Intelligence / LP Audit)
→ Playwright Desktop/Mobile QA
→ Visual QA
→ Visual Optimization
→ Human Approval
→ Publish
→ Traffic
→ CTA Tracking
→ ClickBank Attribution
→ Analytics
→ Optimization
```

Web Anatomy / Page Intelligence is **not started**. It sits after Page
Composition and must never become factual authority.

The operator should **not** need to copy generated text into Elementor,
WordPress, or another page builder. The system itself must generate,
preview, save, render, and publish a professional responsive presell.

Ad final URL = this app’s public presell route (`/p/[slug]`).
The affiliate hop is the **CTA click**, never a hidden redirect and never
a different page for ad reviewers.

---

## Core principles (permanent)

1. No cloaking.
2. No reviewer / user-agent branching.
3. No automatic redirects.
4. Same public destination for real users and advertising review.
5. No fabricated product facts.
6. No fabricated testimonials.
7. No fake ratings.
8. No fake scarcity.
9. No fake countdowns.
10. No fabricated medical / scientific claims.
11. Seller claims are not automatically verified facts.
12. Missing information remains missing (`NOT_FOUND` → omit, do not invent).
13. Grounding validation cannot be bypassed.
14. Policy Linter cannot be bypassed.
15. Human approval remains required before publication.
16. `BLOCKED` content cannot publish.
17. Tracking failure must not prevent user navigation.
18. Preview traffic must not contaminate production analytics.
19. Affiliate disclosure and trust pages remain visible.
20. Visual optimization must never silently alter factual meaning.
21. `WEB_ANATOMY_RECOMMENDATION != PRODUCT_FACT`. Page Intelligence / CRO
    recommendations cannot create, overwrite, or bypass ProductFacts,
    Grounding, Policy, or CONTENT_GATE.

READY on the linter is an **internal** risk assessment. It is not Google
approval, platform compliance, or a suspension guarantee.

---

## Current architecture (as of Phase 8.2)

| Layer | Location | Notes |
|---|---|---|
| App | Next.js 15 App Router, React 19, Tailwind 3 | Admin PT; public EN |
| DB | SQLite `data/presell-os.db` via `better-sqlite3` 11.10.0 | Incremental `PRAGMA` + `ALTER` / `CREATE TABLE IF NOT EXISTS`. Never wipe live campaign data. |
| Campaigns | `src/lib/campaigns.ts` | CRUD, draft default, publish/unpublish, duplicate |
| ProductFacts | `src/lib/product-facts.ts` | Session model during generate; Phase 6 snapshots `sourceFactsJson` on the campaign for re-grounding at publish |
| Import | `src/lib/import-product.ts` | robots.txt fail-closed; semantic extraction; optional AI classification of **source text only** |
| Generation | `src/lib/ai/generate-variants.ts` | Claude; structured JSON; exactly 3 variants |
| Grounding | `src/lib/ai/grounding-validator.ts` | `GROUNDED` / `REVIEW_REQUIRED` / `UNGROUNDED` |
| Policy | `src/lib/policy-linter.ts` | `READY` / `REVIEW_REQUIRED` / `BLOCKED` |
| Publication | `src/lib/publication.ts` | Composed gate; human confirm for warnings; BLOCKED refused |
| Page model | `src/lib/presell-page.ts` | Structured composition + deterministic composer |
| Public render | `src/app/p/[slug]/page.tsx` | Published only; 404 for draft; pixel + PAGE_VIEW only here |
| Preview | `src/app/admin/preview/[slug]/page.tsx` | Draft or published; banner; Visual QA panel; no pixel; no analytics |
| Visual QA | `src/lib/visual-qa/*`, `/visual-frame/[slug]`, `/api/admin/visual-qa` | Playwright render + deterministic layout + Anthropic vision; `PASS` / `REVIEW_REQUIRED` separate from CONTENT_GATE |
| Design | `src/lib/design/*`, `src/lib/creative/*`, `/api/admin/design` | DesignPlan v2 + CreativeCompositionPlan v1; themes; scenes; max 2 visual optimization iterations |
| Tracking | `src/lib/analytics.ts`, `analytics-store.ts` | `aia_sid`, PAGE_VIEW, CTA beacon |
| ClickBank | `src/lib/clickbank-hop.ts`, `/api/clickbank/ins` | `extclid`; INS v8 AES-256-CBC |
| Validation lab | `src/lib/validation/*`, `/admin/validation`, `/visual-frame/validation/[id]` | Isolated diagnostic runs. No analytics/pixels/affiliate hops. Does not publish. |

**Content vs presentation:** generated AI prose is **input** to the page
builder. It is not the final product. The structured `PresellPage` plus a
template family is what the public renderer should show.

---

## Completed phases

Logical order below. Original product Phases 1–8 in `ROADMAP_FASES.md`
(placeholder app, CRUD, markdown template, `/p/[slug]`, CTA href, early
AI variants, early linter, URL import) shipped first. Trust Phases 1–5
and the content/grounding patches are the **Presell OS** stack this
roadmap tracks.

### PHASE 1 — Trust & Compliance Foundation

**STATUS:** COMPLETE  
**PURPOSE:** Public trust chrome so a published presell looks like a real
site, not a cloaked hop.  
**DETAIL:** `docs/PHASE_1_TRUST_COMPLIANCE.md`

**Main features**

- Public pages: `/about`, `/contact`, `/privacy`, `/terms`, `/affiliate-disclosure`, `/robots.txt`
- Public footer on `/p/[slug]`, legal pages, and `/`
- On-page affiliate disclosure
- Same-tab CTA, `rel="nofollow sponsored"`
- Editorial “How we review products”
- Mild health disclaimer (`PUBLIC_HEALTH_DISCLAIMER`)
- Metadata: title, description, canonical, `index,follow` on published pages
- Admin `noindex`; `robots.txt` disallows `/admin`, does not block `/p/` or AdsBot

**Important architecture**

- One public destination: `/p/[slug]`. No user-agent branching.
- Footer is public chrome. Admin list/forms keep a separate layout.
- Restricted markdown body: `## ` headings, `- ` lists; never raw HTML.

**Regression requirements**

- Trust pages 200; footer on public presell; same-tab sponsored CTA; no meta refresh; canonical present; draft/admin not indexed.
- Original completion baseline: **127/127**.

---

### PHASE 2 — Policy Linter V2

**STATUS:** COMPLETE  
**PURPOSE:** Internal publication risk gate. Not ads-platform approval.  
**DETAIL:** `docs/PHASE_2_POLICY_LINTER_V2.md`

**Main features**

- 35 rules: 22 blocking, 9 warning (remainder structural/pass context)
- Categories: destination integrity, affiliate transparency, health/sensitive claims, unverifiable claims, ad↔landing consistency, content quality, CTA/links, trust/site structure, language quality
- Gates: `READY` | `REVIEW_REQUIRED` | `BLOCKED`
- `legacyRiskScore` / `score` is **LEGACY_RISK_SCORE only** — not an approval mechanism
- UI at `/admin/[id]/lint`

**Important architecture**

- Pure function `lintCampaign` — no network, no publish side effects.
- Health findings remain even when seller-attributed; attribution is not verification.
- Later health-linter patch added softened-claim patterns (`may`, `supports`, `helps`, `designed to`, …) without auto-clearing on attribution.

**Regression requirements**

- Blocking health/unverifiable/Portuguese/placeholder/invalid hop still BLOCKED.
- Warnings do not become READY without the Phase 2.5 confirm path.
- Original completion baseline: **186/186**.

---

### PHASE 2.5 — Draft / Review / Publish

**STATUS:** COMPLETE  
**PURPOSE:** Separate “saved in admin” from “live on `/p/[slug]`”.  
**DETAIL:** `docs/PHASE_2_5_PUBLICATION_WORKFLOW.md`

**Main features**

- `publicationStatus`: `draft` | `published`
- `publishedAt` set on publish, cleared on unpublish or edit of a live page
- New campaigns (manual, AI, duplicate) default **draft**
- Draft `/p/[slug]` → real **404** (does not leak headline)
- Admin preview loads draft or published; banner `PREVIEW — NOT PUBLISHED`
- Preview never executes the public pixel
- Publish: READY → human publish; REVIEW_REQUIRED → explicit confirm; BLOCKED → refused
- Editing a published campaign returns it to **draft**

**Important architecture**

- Incremental migration: existing rows backfilled `published` so live URLs were not taken offline.
- New INSERTs always set `draft` in `createCampaign` (do not rely on column default).
- `tryPublish` is the single verdict used by the publish action.

**Regression requirements**

- Draft 404; preview works; pixel only on published public route; edit demotes; duplicate is draft.
- Original completion baseline: **242/242**.

---

### PHASE 3 — Presell Content Engine V2

**STATUS:** COMPLETE  
**PURPOSE:** Ground generation in ProductFacts, not model memory.  
**DETAIL:** `docs/PHASE_3_CONTENT_ENGINE_V2.md`

**Main features**

- ProductFacts origin: `IMPORTED` | `MANUAL`
- Provenance: `DIRECT_SOURCE` | `HEURISTIC_EXTRACTION` | `AI_SOURCE_CLASSIFICATION` | `MANUAL` | `NOT_FOUND`
- Import quality: `SUFFICIENT` | `PARTIAL` | `INSUFFICIENT`
- Variants: `REVIEW` | `EDUCATIONAL` | `BUYER_GUIDE` (no urgency angle)
- Missing facts must not be invented
- Importer respects `robots.txt` (fail closed)
- Operator product name grounding; semantic extraction for ingredients, usage, guarantee, features

**Important architecture**

- AI copy is not evidence. Only imported/manual facts are.
- `DIRECT_SOURCE` means “appeared on the source page”, not scientific verification.
- Pricing and manufacturer may remain `NOT_FOUND`.
- Generate UI never calls publish.

**Regression requirements**

- Three approaches only; robots still enforced; INSUFFICIENT import blocks easy generate; NOT_FOUND fields omitted from the prompt as inventable facts.

---

### PHASE 3 PATCH — Real product importer

**STATUS:** COMPLETE  
**PURPOSE:** Stop junk facts from promotional sales pages (ProDentim live import).

**Main features**

- Canonical operator product name kept over CTA / testimonial / “discover” headings
- Promotional heading filtering
- Semantic / card-based ingredient extraction
- Usage normalization (drop trailing separable health-benefit clause)
- Source snippets / provenance labels in the facts review UI

**Real validation**

- `PRODUCT=ProDentim`
- `IMPORT_QUALITY=SUFFICIENT`

---

### PHASE 3 PATCH — AI JSON generation

**STATUS:** COMPLETE  
**PURPOSE:** Stop `"A resposta não é um JSON válido."` on live Claude responses.

**Main features**

- Anthropic structured output (`output_config.format` json_schema; object root `{variants:[...]}`)
- Strict parser in `src/lib/ai/parse-ai-json.ts` (raw / fence / embedded scan; truncation detection)
- Exactly three variants: REVIEW, EDUCATIONAL, BUYER_GUIDE
- Controlled retry max 1
- `max_tokens`: 16384
- No `eval`

**Regression requirements**

- Truncated JSON is an error, not a silent partial page. Schema must not use unsupported Anthropic `minItems`/`maxItems` other than 0/1.

---

### PATCH — Grounding + Health Linter

**STATUS:** COMPLETE  
**PURPOSE:** Stop unsourced encyclopedia facts and restated seller health claims from shipping as READY.

**Main features**

- Generation prompt forbids world knowledge, strengthening seller hedges, and unsourced research language
- Grounding Validator: `GROUNDED` | `REVIEW_REQUIRED` | `UNGROUNDED`
- Final publication gate = **grounding + Policy Linter** (`composePublicationGate`)
- Non-GROUNDED cannot be READY
- Health linter flags softened claims (`may`, `might`, `can`, `could`, `potential`, `supports`, `helps`, `designed to`, `intended to`, `associated with`, `contributes to`, plus mechanism/research/safety/drug-interaction patterns)
- Attribution documents the seller said it; it does **not** auto-clear the finding

**Important architecture**

- `lintVariant` returns `grounding` + `finalGate`
- Generate UI shows POLICY / GROUNDING / FINAL and unsupported claims

**Latest verified complete regression (pre–Page Builder):**

```
TESTS_TOTAL=581
TESTS_PASSED=581
TESTS_FAILED=0
PHASE_1_REGRESSION=PASS
PHASE_2_REGRESSION=PASS
PHASE_2_5_REGRESSION=PASS
PHASE_3_REGRESSION=PASS
PHASE_4_REGRESSION=PASS
PHASE_5_REGRESSION=PASS
TYPECHECK=PASS
BUILD=PASS
```

---

### PHASE 4 — Tracking & conversion foundation

**STATUS:** COMPLETE  
**PURPOSE:** First-party funnel: visit → CTA click → outbound hop. No sale inference.  
**DETAIL:** `docs/PHASE_4_TRACKING_FOUNDATION.md`

**Main features**

- PAGE_VIEW (`presell_visits`) on published `/p/[slug]` only
- CTA click (`cta_clicks`) via `POST /api/track/cta` (beacon / keepalive)
- Session cookie `aia_sid`: `crypto.randomUUID()`, HttpOnly, SameSite=Lax
- Attribution keys: UTM + `gclid` / `fbclid` / `msclkid` (clipped, allowlisted)
- CTR = CTA sessions / unique presell sessions
- Preview and drafts excluded; `x-aia-analytics: skip` for automated tests
- Tracking failure-safe (navigation continues)

**Important architecture**

- Positions started as `hero` | `middle` | `final`. Phase 6 added `guarantee` | `sticky` to the same enum and store — do not create a second tracker.
- Visits/sessions do not necessarily represent individual humans.

**Regression requirements**

- No PAGE_VIEW from preview/draft; CTA beacon failure does not `preventDefault`; hop still works.

---

### PHASE 5 — ClickBank sales attribution

**STATUS:** COMPLETE (code + automated tests; operator still confirms a live INS ping in production)  
**PURPOSE:** Attribute ClickBank INS v8 sales/refunds/rebills to a CTA `clickId`.  
**DETAIL:** `docs/PHASE_5_CLICKBANK_ATTRIBUTION.md`

**Main features**

- HopLink / Direct Tracking Link: write **`extclid`** (UUID `clickId`, dashes preserved). Do **not** write `tid`
- `POST /api/clickbank/ins` — INS v8 envelope, AES-256-CBC with `CLICKBANK_INS_SECRET`
- Status: `ATTRIBUTED` | `UNATTRIBUTED`
- Types: SALE, RFND, CGBK, BILL, TEST, CANCEL-REBILL, etc. as documented — **no sale inference**
- Analytics: sales, refunds, gross / refunded / net commission, attributed vs unattributed, CTA→Sale
- `/admin/transactions`

**Important architecture**

- Unattributed sale is still stored; missing/unknown `extclid` does not fabricate a campaign.
- Buyer PII is not persisted.
- Duplicate INS receipts are idempotent.

**Regression requirements**

- `extclid` only on ClickBank hops; malformed hop rewrite is failure-safe; INS rejects bad authenticity.
- Original clean Phase 5 verification: **480/480**.

---

## Current phase

### PHASE 6 — Page Builder V2

**STATUS:** IN PROGRESS  
**PURPOSE:** Transform validated content into a complete professional responsive presell so the operator does not paste copy into Elementor/WordPress.  
**DETAIL:** `docs/PHASE_6_PAGE_BUILDER_V2.md`

**Generated prose is INPUT to the Page Builder. The prose itself is NOT the final product.**

**Architecture**

```
Content (variant + ProductFacts)
→ Structured Page Model (PresellPage)
→ Page Composer (deterministic)
→ Visual Template (REVIEW | BUYER_GUIDE | EDITORIAL)
→ Public Renderer (/p/[slug]) + Admin Preview
```

Code for this phase is already in the tree. Do **not** revert it or start Phase 7 until the operator validates Phase 6 in the real environment. Do **not** weaken grounding, Policy Linter V2, draft/publish, ClickBank, `extclid`, analytics, disclosure, or trust pages to “finish” the builder.

**Implemented so far (do not rewrite from scratch)**

- `PresellPage` v1 in `src/lib/presell-page.ts`: hero, sections, omitted components, image provenance
- Deterministic `composePresellPage` (no extra AI call for composition)
- Template families: REVIEW, BUYER_GUIDE, EDITORIAL
- Components under `src/components/presell/`: page view, product image, FAQ accordion, preview frame, CTA wrapper around existing `AffiliateCta`
- Product images: import `og:image` / content image → local `data/product-images/` when fetch succeeds; provenance DIRECT_SOURCE / MANUAL / PLACEHOLDER / NOT_FOUND; never AI packshots
- Admin: template picker after variant select; composition preview (included/omitted, policy/grounding/final gate, desktop/mobile); save as DRAFT
- Controlled edits: headline, subheadline, CTA label, section visibility (not a general drag-and-drop builder)
- Public renderer branches to structured page when `pageComposition` exists; otherwise legacy markdown
- CTA positions `hero` | `middle` | `final` | `guarantee` | `sticky` — same tracking + `extclid` path
- Sticky mobile CTA: `md:hidden`, same hop, same-tab, `rel="nofollow sponsored"`
- Incremental columns: `pageTemplate`, `pageComposition`, `productImageSrc`, `productImageProvenance`, `subheadline`, `sourceFactsJson`
- `tryPublish` re-runs grounding against the facts snapshot when present

**Requirements still owned by this phase**

- Automatic composition from available facts only
- Desktop/mobile preview using public components; `PREVIEW — NOT PUBLISHED`; no pixel/analytics/CTA production counts
- Responsive rendering (375 / 390 / 768 / 1024 / 1440): no horizontal overflow
- SEO/metadata for published pages; drafts non-indexable
- Accessibility (semantic headings, FAQ keyboard, contrast, alt text)
- Performance: server-render friendly; no heavy new UI framework
- Legacy campaign compatibility
- Real ProDentim visual E2E without publishing

**Reusable components (names may differ in code)**

PresellHeader, HeroSection, ProductImage, EditorialBadge, QuickSummary, ContentSection, FeatureGrid, IngredientGrid, IngredientCard, UsageCard, ProsConsiderations, GuaranteeSection, FAQAccordion, CTASection, StickyMobileCTA, AffiliateDisclosure, TrustFooter.

**Not in this phase**

Full drag-and-drop, A/B traffic splitting, automatic template optimization, Google Ads API, automatic campaign/bid/ad launch, fake social proof, automatic publishing.

**Session baseline after Page Builder code (still IN PROGRESS — not operator-complete)**

```
TESTS_TOTAL=690
TESTS_PASSED=690
TESTS_FAILED=0
TYPECHECK=PASS
BUILD=PASS
```

A real ProDentim compose E2E created draft `/admin/preview/prodentim-page-builder-v2` and did **not** publish. Final gate on that draft was BLOCKED (not forced READY).

---

### PHASE 7 — Visual QA Agent + Premium International Visual Standard

**STATUS:** COMPLETE  
**PURPOSE:** Inspect an actually rendered presell and decide whether the visual presentation is ready for human review. Does **not** redesign pages.  
**DETAIL:** `docs/PHASE_7_VISUAL_QA.md`, `docs/VISUAL_STANDARD.md`

**TARGET_VISUAL_STANDARD = PREMIUM_INTERNATIONAL**

A page can be technically functional (no overflow, valid HTML) and still fail Visual QA.

**Architecture**

```
Rendered presell (/visual-frame/[slug])
  → Playwright Chromium (real viewports)
  → Screenshots (full-page JPEG; segmented hero/upper/middle/lower/footer if too large)
  → Deterministic layout + content-density analysis
  → Playwright technical/accessibility heuristics (Lighthouse equivalent; Lighthouse itself not invoked)
  → Anthropic multimodal structured review
  → VisualQAReport { PASS | REVIEW_REQUIRED }
  → SQLite visual_qa_reports (JSON only; no screenshot blobs)
```

**Visual QA model / provider**

- Provider: existing Anthropic (`ANTHROPIC_API_KEY`)
- Model: `claude-sonnet-4-5-20250929`
- Structured output: `output_config.format` json_schema (`VISUAL_QA_JSON_SCHEMA`)
- Fallback parse: `extractJsonText` in `src/lib/ai/parse-ai-json.ts`
- If AI is unavailable or parse fails: `VISUAL_QA=REVIEW_REQUIRED`, `AI_VISUAL_REVIEW=UNAVAILABLE|PARSE_FAILED`. Never PASS.

**Viewport strategy**

- Multimodal screenshots: **390×844** and **1440×1000**
- Deterministic overflow/stacking: **375, 390, 768, 1024, 1440**
- Chrome-free inspect URL `/visual-frame/[slug]` (drafts allowed, `noindex`, robots disallow). `renderPixel={false}`, `trackClicks={false}`, header `x-aia-analytics: skip`.

**Finding model**

Each finding: `category`, `severity` (`INFO` | `WARNING` | `HIGH`), `viewport`, `description`, `evidence`, `suggestedPresentationFix`, `actionCode`, `source` (`deterministic` | `multimodal` | `technical`).

No numeric 87/100 scores. Gates stay separate:

- `CONTENT_GATE` = Policy + Grounding (`READY` / `REVIEW_REQUIRED` / `BLOCKED`)
- `VISUAL_QA_GATE` = `PASS` / `REVIEW_REQUIRED`

Visual QA does not auto-publish and does not loosen a content BLOCKED.

**Action codes (Phase 8 handoff)**

`REDUCE_VISIBLE_CONTENT_DENSITY`, `PROMOTE_PRODUCT_VISUAL`, `CREATE_HERO_FOCAL_POINT`, `COLLAPSE_SECONDARY_DETAILS`, `INCREASE_SECTION_VARIATION`, `IMPROVE_TYPE_SCALE`, `REDUCE_CARD_REPETITION`, `IMPROVE_CTA_DISTRIBUTION`, `ADD_VISUAL_ASSET_SLOT`, `IMPROVE_MOBILE_COMPOSITION`, `ACQUIRE_PRODUCT_IMAGE`, `IMPROVE_PROGRESSIVE_DISCLOSURE`, `STRENGTHEN_ART_DIRECTION`, `REMOVE_FAKE_TRUST_SIGNAL`.

**Admin**

`/admin/preview/[slug]` → **Run Visual QA**. Shows VISUAL QA status, mobile/desktop, high-priority findings, other findings, technical notes, recommended visual fixes.

**Persistence**

Table `visual_qa_reports`: campaignId, slug, template, status, reportJson, createdAt. Screenshots stay in `data/visual-qa-tmp/` (gitignored). Do not store JPEG blobs in SQLite.

**Test baseline**

```
TESTS_TOTAL=781
TESTS_PASSED=781
TESTS_FAILED=0
TYPECHECK=PASS
BUILD=PASS
```

Real ProDentim draft `/admin/preview/prodentim-page-builder-v2` Visual QA = `REVIEW_REQUIRED` (placeholder product visual, card repetition, density, weak rhythm, weak progressive disclosure, long page). CONTENT_GATE remained `BLOCKED`. Publication status remained `draft`. Public `/p/prodentim-page-builder-v2` remained 404. Visits/clicks stayed 0.

**New dependency:** `playwright` ^1.55.0 (Chromium). `next.config.ts` `serverExternalPackages` includes `playwright`.

---

### PHASE 8 — Intelligent Page Designer + Auto Visual Optimization

**STATUS:** COMPLETE  
**PURPOSE:** Consume Visual QA findings and improve **presentation** so presells can look like premium international product/editorial pages. Does not rewrite facts or publish.  
**DETAIL:** `docs/PHASE_8_PAGE_DESIGNER.md`

**DesignPlan architecture**

Presentation-only JSON (`version: 1`) stored on the campaign: theme, hero variant, typography/spacing/width, per-section variant + PRIMARY/SECONDARY/DETAIL + collapse/lead counts, CTA strategy, mobile strategy, decorative flag, applied action codes.

Planner is **deterministic**. AI was not used for design planning. Missing packshot → honest fallback composition, never an AI fake packshot.

**Themes:** CLEAN, NATURAL, BOLD, EDITORIAL, PREMIUM (independent of content templates REVIEW / BUYER_GUIDE / EDITORIAL).

**Hero system:** PRODUCT_SPLIT, EDITORIAL_SPLIT, CENTERED_PRODUCT, ASYMMETRIC_PRODUCT.

**Progressive disclosure:** DETAIL (and extra cards/paragraphs) move into accessible `<details>` / FAQ accordion. Wording is not rewritten.

**Asset strategy:** Importer scores og/twitter/json-ld/img/srcset/picture candidates and rejects pixels, logos, CTA banners, tiny images, extreme aspect ratios. Provenance unchanged: DIRECT_SOURCE / MANUAL / PLACEHOLDER / NOT_FOUND.

**Optimization loop:** Render → Visual QA → map action codes → re-render. `MAX_VISUAL_OPTIMIZATION_ITERATIONS=2`. Early stop on PASS, no safe changes, or no severity improvement. Never force PASS. `updateCampaignDesign` does not change publicationStatus or copy.

**Admin:** Apply Design, Run Visual QA, Auto Optimize on `/admin/preview/[slug]`.

**Real ProDentim E2E (draft `prodentim-page-builder-v2`)**

- CONTENT_GATE remained BLOCKED. Not published. `/p/` remained 404. Visits/clicks 0.
- VISUAL_QA remained REVIEW_REQUIRED (missing usable packshot; stored `/media/product` file is not a packshot).
- Theme PREMIUM. Cards dropped from a repetitive matrix (Phase 7 HIGH REDUCE_CARD_REPETITION) to 4 visible card-like items. Desktop page height ~4390px after optimization (Phase 7 was an extremely tall documentation-like page).
- Remaining HIGH is dominated by ACQUIRE_PRODUCT_IMAGE / weak product visual — expected without a legitimate packshot.

**Test baseline**

```
TESTS_TOTAL=835
TESTS_PASSED=835
TESTS_FAILED=0
TYPECHECK=PASS
BUILD=PASS
```

**DB:** incremental `designPlanJson`, `visualTheme`, `designVersion`. No new npm dependencies.

---

### PHASE 8.1 — Premium Art Direction & Asset Intelligence

**STATUS:** PARTIAL (code complete; human visual review required)  
**PURPOSE:** Close the gap between a clean structured template and a professionally art-directed modern international consumer presell. Presentation + asset intelligence only. Does not rewrite facts, publish, or weaken gates.

**Architecture**

DesignPlan v2 (v1 JSON still parses and upgrades) adds bounded art-direction tokens (`heroScale`, `displayScale`, `sectionSpacing`, `sectionContrast`, `cornerLanguage`, `shadowLanguage`, `surfaceDepth`, `decorativeIntensity`, `imageScale`, `imageOverlap`, `contentRhythm`, `accentPlacement`) and a story-band rhythm (`quiet` / `impact` / `compact` / `wide` / `split` / `statement` / `disclosure`). Planner remains deterministic. AI may classify an ambiguous image **role** only (`What role does this image appear to serve?`) and never infers efficacy, authenticity, or endorsement.

**Asset intelligence**

Source page → discovery (`img` / lazy attrs / `srcset` / `picture` / CSS `background-image` / OG / Twitter / JSON-LD; relative and protocol-relative URLs resolved) → download/probe within safety limits → **decoded** width/height (HTML `width`/`height` absence is not rejection) → deterministic classification first, optional multimodal role classification for `UNCERTAIN` → select best `PRODUCT_PACKSHOT` (else `PRODUCT_LIFESTYLE`) → materialize locally with provenance `DIRECT_SOURCE` → Design Planner.

Roles: `PRODUCT_PACKSHOT`, `PRODUCT_LIFESTYLE`, `INGREDIENT_VISUAL`, `BRAND_LOGO`, `DECORATIVE_SOURCE`, `UNUSABLE`.

A clean square/portrait product composition is a valid packshot. Transparent background is not required. CTA banners, ORDER NOW graphics, buttons, tracking pixels, payment badges, testimonial avatars, logos, navigation assets, and social icons remain rejected. Filename alone is not classification.

Provenance (product assets): `DIRECT_SOURCE` | `MANUAL` | `NOT_FOUND`. Classification method is stored separately: `DETERMINISTIC` | `AI_CLASSIFIED` | `MANUAL`. AI classification does not change provenance and does not search third-party image indexes.

`PRODUCT_ASSET_STATUS`: `READY` | `NEEDS_ASSET` | `NOT_APPLICABLE`. Missing a legitimate packshot is `NEEDS_ASSET` (admin: **PRODUCT PACKSHOT REQUIRED**) — never silently treated as production-quality. Operator can upload/replace/remove jpeg/png/webp via the existing local `/media/product` store (`provenance=MANUAL`). Production still needs object storage.

**Missing-asset vs real-asset design**

- `PACKSHOT_MISSING` → editorial-first hero (`MAGAZINE_PRODUCT` / `MINIMAL_LUXURY`), typographic empty-asset composition, no giant black fake packshot.
- `PACKSHOT_AVAILABLE` → product-forward hero (`PRODUCT_STAGE` / `PRODUCT_CANVAS` / `ASYMMETRIC_EDITORIAL`) using `ProductStage` (`object-fit: contain`, no packaging distortion).

Hero V2 also keeps Phase 8 aliases. Section V2 includes `PRODUCT_FACT_CANVAS`, `INGREDIENT_EDITORIAL_GRID` / `INGREDIENT_ORBIT`, `VISUAL_NUMBER_STEP`, `CONSIDERATION_COLUMNS`, `WIDE_GUARANTEE_STATEMENT`, `MAGAZINE_TEXT_BLOCK`, `FACT_RIBBON`, `VISUAL_DISCLOSURE_GROUP`. Ingredient photography is used only with provenance; otherwise numbered typographic composition. No fake commercial signals.

**Human quality bar**

Automated Visual QA PASS is not sufficient. Phase 8 AFTER screenshots remain the negative baseline (`data/visual-qa-tmp/phase8-prodentim/`). Phase 8.1 AFTER + COMPARE live in `data/visual-qa-tmp/phase8-1-prodentim/`. Lighthouse is deferred to Phase 9 (not faked).

**Real ProDentim result**

Draft `prodentim-page-builder-v2` remained unpublished. CONTENT_GATE stayed `BLOCKED`. `/p/` stayed 404. Analytics were not contaminated.

Asset discovery on the supplied source found 40 image candidates; 16 were rejected as CTA/banner/icon/footer/unusable. The highest-scoring source graphic (`introducting_prodentim.png`) has no dimensions and is not a packshot. The stored local file is 501×192 (`DIRECT_SOURCE`) and is classified `UNUSABLE` (banner-like). `REAL_PRODUCT_IMAGE_FOUND=NO`. `PRODUCT_ASSET_STATUS=NEEDS_ASSET`.

DesignPlan v2 applied `PREMIUM` / `MAGAZINE_PRODUCT` / empty-asset hero (no black placeholder). Visual QA remained `REVIEW_REQUIRED` (HIGH 12→9). Remaining actions include `ACQUIRE_PRODUCT_IMAGE`, `CREATE_HERO_FOCAL_POINT`, `PROMOTE_PRODUCT_VISUAL`, `STRENGTHEN_ART_DIRECTION`. AFTER screenshots: `data/visual-qa-tmp/phase8-1-prodentim/`. Lighthouse deferred to Phase 9.

Human review is still required: the empty-asset composition is no longer a black-box template, but it was not yet a packshot-forward international consumer presell until the acquisition patch below.

**Corrective patch — source-asset acquisition**

Root cause of `REAL_PRODUCT_IMAGE_FOUND=NO` with 40 candidates: (1) HTML `width`/`height` absence (`0×0`) was treated as unusable, so candidates were never downloaded; (2) Bootstrap `container` in surrounding HTML was matched as a packshot signal; (3) import materialized the first/highest HTML-scored graphic, which was an ORDER NOW banner (501×192); (4) there was no re-acquire + decode-dimensions pass after `NEEDS_ASSET`.

Generic fix (not a product-name or domain hardcode): discover lazy/srcset/picture/CSS/OG/Twitter/JSON-LD URLs; resolve relative and protocol-relative URLs; probe up to 18 candidates; sniff content-type from magic bytes; decode real dimensions; reclassify; prefer `PRODUCT_PACKSHOT`; optional Claude role classification only for `UNCERTAIN`; store as `DIRECT_SOURCE`. Design planner rebuilds with `PACKSHOT_AVAILABLE` when asset status flips to `READY`.

**Real ProDentim result after the patch**

Re-import/rediscovery of the supplied source selected `prodentim3-bottle.png` (2550×2430) as `PRODUCT_PACKSHOT` / `DIRECT_SOURCE` / `DETERMINISTIC`. `PRODUCT_ASSET_STATUS` went `NEEDS_ASSET` → `READY`. DesignPlan rebuilt `PREMIUM` / `PRODUCT_STAGE` / `HERO_FOCAL`. CONTENT_GATE stayed `BLOCKED`. Campaign stayed `draft`. `/p/` stayed 404. Analytics were not contaminated. Visual QA remained `REVIEW_REQUIRED` (HIGH 9→3 on the empty-asset report; `ACQUIRE_PRODUCT_IMAGE` dropped). Packshot screenshots: `data/visual-qa-tmp/phase8-1-prodentim/PACKSHOT_DESKTOP.jpg` and `PACKSHOT_MOBILE.jpg`. Empty-asset AFTER/COMPARE files were kept as the negative baseline.

Human review of the packshot screenshots is still required before calling this phase complete. Do not publish.

Regression after this patch: **929/929**, `tsc --noEmit` PASS, `next build` PASS.

**Known limitations**

- Asset intelligence cannot invent official photography. A source page that only yields banners/CTAs correctly stays `NEEDS_ASSET`.
- Optional multimodal role classification is skipped without `ANTHROPIC_API_KEY` and never generates images. Third-party image search is not part of the pipeline.
- Local `data/product-images/` is still not multi-instance production storage.
- Human review of PACKSHOT screenshots is required before calling this phase complete.
- Probe budget is bounded (`MAX_ASSET_PROBES=18`, 2MB). Extensionless/CDN URLs are accepted only when decoded bytes sniff as an image.

---

### PHASE 8.2 — Creative Composition Engine

**STATUS:** COMPLETE (human visual review accepted; known limitation recorded)

Human visual review of Phase 8.2 acceptance screenshots: ENGINE=PASS, PERFORMANCE=PASS, HUMAN_VISUAL_REVIEW=PASS, VISUAL_QA=REVIEW_REQUIRED with known limitation `IMPROVE_TYPE_SCALE` (mobile ingredient type scale). PREMIUM_INTERNATIONAL=ACHIEVED_WITH_KNOWN_LIMITATION. ProDentim remained draft.

---  
**PURPOSE:** Move from stacked fact-sections to a visual narrative of composition scenes. Presentation only. Does not rewrite facts, publish, or weaken gates.

**Architecture**

`CreativeCompositionPlan` v1 sits after DesignPlan:

ProductFacts + assets + DesignPlan + Visual QA findings → deterministic Creative Composition Planner → scene list → responsive renderer.

The plan never introduces factual content. Optional composition critique reuses Phase 7 Visual QA findings (no second multimodal call required to render).

**Narrative roles:** `INTRODUCE` `ORIENT` `EXPLAIN` `DIFFERENTIATE` `CONSIDER` `REASSURE` `DISCLOSE` `ACT`  
**Scenes:** `HERO_PRODUCT_STAGE` `PRODUCT_FACT_SCENE` `INGREDIENT_SHOWCASE` `EDITORIAL_EXPLAINER` `NUMBERED_USAGE_SCENE` `PRODUCT_CHARACTERISTICS_SCENE` `CONSIDERATION_EDITORIAL_SCENE` `GUARANTEE_STATEMENT_SCENE` `TRUST_DISCLOSURE_SCENE` `CTA_TRANSITION_SCENE`

Content weights `PRIMARY` / `SUPPORTING` / `DETAIL` control visibility and progressive disclosure. Asset uses `PRIMARY_HERO` / `SECONDARY_CONTEXT` / `SECTION_ANCHOR` / `TRANSITION_ANCHOR` / `DECORATIVE_SUPPORT` cap packshot reuse (max 3, different contexts). Desktop and mobile compositions may diverge without duplicating copy. Decorative geometry is capped at two variants and must not become a repeating template signature.

**Sticky CTA**

Mobile sticky CTA stays hidden while the hero CTA is visible, waits for meaningful scroll intent, hides when another primary CTA or the guarantee/footer/disclosure band is in view, uses a compact presentation, and is padded for safe-area plus collision space. Tracking/`extclid` unchanged.

**Performance architecture**

Premium composition is a release gate together with speed. The public/visual-frame route is server-rendered; client JS is limited to CTA tracking and sticky CTA behavior. Product images are delivered through `/media/product/[file]?w=&fm=webp` (hero LCP variant, below-fold lazy srcset). Fonts remain system stacks (`next/font` not required). No design CDNs, no beauty score. Lighthouse is measured against `/visual-frame/[slug]` with analytics skip headers.

**DB:** incremental `creativeCompositionJson`, `creativeCompositionVersion`. No new npm dependencies.

**Final premium visual + performance pass**

Human review of the first Phase 8.2 screenshots found a stronger hero and narrative grouping, but remaining issues: product disappearing after ingredients, accidental desktop whitespace, repetitive arches, text-heavy mobile editorial, dominant sticky CTA, a spacious CTA-only band, and ingredient/hero balance. This pass refined those presentation issues without a new phase and without mutating facts.

Draft `prodentim-page-builder-v2` remained unpublished. CONTENT_GATE stayed `BLOCKED`. `/p/` stayed 404. Analytics were not contaminated. Packshot provenance stayed `DIRECT_SOURCE`.

Final screenshots: `data/visual-qa-tmp/phase8-2-final-prodentim/` compared against preserved `data/visual-qa-tmp/phase8-2-prodentim/`. Phase 8.1 PACKSHOT files remain the earlier baseline.

Lab Lighthouse against `/visual-frame` (analytics skipped, `noindex` by design): desktop performance 100 / accessibility 100 / best-practices 96 / SEO 66; mobile 91 / 100 / 96 / 66. SEO 66 is `is-crawlable` failing on the QA frame. LCP desktop 0.71s, mobile 2.65s. CLS 0. Image transfer uses `/media/product?w=&fm=webp` (original 1.4MB PNG is not the default visitor payload).

Visual QA remained `REVIEW_REQUIRED` (HIGH 1; remaining multimodal `REDUCE_VISIBLE_CONTENT_DENSITY`). `PROMOTE_PRODUCT_VISUAL` was no longer a HIGH finding after the extra product-anchored moment. Human review of AFTER vs COMPARE is required before calling this phase complete. Do not self-certify PREMIUM_INTERNATIONAL. Do not publish.

**Known limitations**

- Creative planner is deterministic; it does not copy third-party layouts.
- Visual QA HIGH findings are kept when still legitimate (not forced to PASS). Remaining on this pass: multimodal `REDUCE_VISIBLE_CONTENT_DENSITY`.
- Sticky CTA still occupies the bottom of the mobile viewport while shown; it no longer stays up over the hero, guarantee, or footer.
- Lighthouse scores are lab data from `/visual-frame`, not field Core Web Vitals. That route is `noindex`, so SEO is not a public-page score.
- Image optimizer uses `sharp` when available (already pulled in by Next.js); original files are served if resize fails.

**Premium acceptance patch**

Refinement only. No Phase 8.3. No Creative Composition Engine rebuild. Desktop hierarchy, asymmetric hero, packshot, ingredients, usage, Health/Safety + Overview, and 60 DAYS guarantee were preserved.

Mobile density used the existing PRIMARY / SUPPORTING / DETAIL model: 2-column ingredient grid with DETAIL behind `Read more`; usage TRANSITION_ANCHOR packshot kept on desktop and omitted on mobile; Health/Safety and Overview show a short orientation plus accessible disclosure. Sticky CTA logic was not made more aggressive; 390px overlap check stayed clean.

LCP investigation (mobile lab, `/visual-frame`, analytics skipped): element is the hero packshot (`img.ps-product-stage-img`). TTFB 499ms, Load Delay 0, Load Time 0, Render Delay 1928ms (79%). Requested `?w=540&fm=webp&q=72` (29.5KB), `sizes` 232px, display 232×221, `fetchpriority=high`, `loading=eager`, link preload. Load Delay 0 means delivery is not the bottleneck; remaining time is TTFB + render delay. Visual quality was not reduced to chase ~150ms.

Lab after this patch: desktop performance 100 / accessibility 100 / best-practices 96 / SEO 66; mobile 95 / 100 / 96 / 66. Mobile LCP 2.43s (was 2.65s), CLS 0, FCP 1.20s, TBT 171ms. Transfer: total 195239 / images 49306 / JS 113527 / CSS 10268 / fonts 0. SEO 66 remains the intentional `noindex` Visual QA frame (`SEO_FRAME_RESULT=NOT_APPLICABLE_FOR_PUBLIC_SEO`).

Visual QA stayed `REVIEW_REQUIRED` (HIGH 1). `REDUCE_VISIBLE_CONTENT_DENSITY` is gone. Remaining multimodal HIGH is `IMPROVE_TYPE_SCALE` on the compact mobile ingredient grid (identical type treatment / small section packshot). That is not forced to PASS. Screenshots: `data/visual-qa-tmp/phase8-2-acceptance-prodentim/` vs preserved `phase8-2-final-prodentim`. Draft `prodentim-page-builder-v2` stayed unpublished; CONTENT_GATE `BLOCKED`; `/p/` 404; analytics/pixel clean.

Human acceptance of AFTER vs COMPARE is still required. Do not self-certify PREMIUM_INTERNATIONAL. Do not publish.

**Known limitations (acceptance patch)**

- Multimodal Visual QA still emits HIGH findings that shift between runs; this patch does not force PASS.
- Remaining HIGH is type-variation on the mobile ingredient grid, a tradeoff of the density refinement. Enlarging type or inventing ingredient photography would violate this patch.
- Mobile LCP is now 2.43s in this lab run. Render delay still dominates; do not damage the packshot to chase further milliseconds.
- Public script transfer remains ~114KB, mostly Next.js/React shared runtime (~103KB first-load shared). Client islands stay Sticky CTA + Affiliate CTA.
- `/visual-frame` SEO is not public SEO.

---

---

## Future phases

Do not implement these until the current phase is validated.

### PHASE 9 — Production readiness / deployment

**STATUS:** IMPLEMENTATION COMPLETE — PRODUCTION DEPLOYMENT PAUSED BY OPERATOR

**PURPOSE:** Move from a local development system to a production-ready application without weakening content, publication, tracking, attribution, visual, or draft-isolation safeguards. Not a redesign. Not Ads. Not experimentation.

See `docs/PRODUCTION_DEPLOYMENT.md` for the operator checklist, backup/restore, rollback, incidents, and secret rotation.

**Architecture**

Single long-running Node/Next process. SQLite on a persistent volume (`PRESELL_OS_DB`). Media `LOCAL` on the same volume or `OBJECT_STORAGE` (S3-compatible adapter). `AIA_ENV=production` enables hard environment validation (HTTPS origin, admin password, session HMAC, ClickBank INS secret, internal frame secret). `next start` without `AIA_ENV=production` stays a local production-build preview and does not silently skip auth when `ADMIN_PASSWORD` is set.

Admin is a single-operator password + HMAC cookie. `/admin/*` and `/api/admin/*` require that session in production. `/visual-frame` is internal (noindex; production requires admin session or `x-aia-internal`). `/api/clickbank/ins` is the webhook. `/p/[slug]` remains the only public presell.

**Not done by this phase (operator):** DNS, TLS certificates, provisioning a host/volume, live ClickBank INS URL registration, publishing any real campaign.

No paid traffic. ProDentim stays draft.

**Known limitations**

- SQLite + `better-sqlite3` is not serverless/multi-instance.
- In-memory rate limits are per process.
- CSP allows `'unsafe-inline'` scripts so campaign pixels and Next.js can run.
- Importer SSRF blocks localhost/private IPv4; DNS rebinding is a residual risk.
- Object storage uses SigV4 over fetch; operator must supply bucket credentials.

---

### LOCAL PRODUCT & LP VALIDATION LAB

**STATUS:** IN PROGRESS

**PURPOSE:** Prove Presell OS is a generic presell generation system before production deployment. Validate product diversity, content diversity, visual diversity, responsive quality, AI visual review, grounding, policy safety, performance, and failure modes in localhost.

Production deployment remains **PAUSED_BY_OPERATOR**. Do not deploy, configure DNS, register live ClickBank INS, publish the real ProDentim campaign, or start Ads.

ProDentim remains the accepted Phase 8.2 baseline/reference (`DRAFT`, `CONTENT_GATE=BLOCKED`, public 404). It is not the only validation product. The operator will provide/import ~5 real products. Do not fabricate a product set.

**Current priority (do not skip):**

```
Generation
→ Grounding
→ Policy
→ Content Gate
```

Do **not** mark Generation, Grounding, Policy, or CONTENT_GATE complete.
Page Composition optimization and Page Intelligence / Web Anatomy remain
blocked until Content Gate safety is validated on a real generation after
operator review.

**CURRENT BLOCKER — first real generation false negatives**

First Anthropic generation (`claude-sonnet-4-5-20250929`, `REQUEST_COUNT=1`)
produced unsupported copy relative to ProductFacts, including refund-duration
language, healthcare-professional / pregnancy / nursing / medication advice,
manufacturer implication, results timeline, and category expansion.

Gates still returned:

- `GROUNDING_GATE=GROUNDED`
- `POLICY_GATE=READY`
- `CONTENT_GATE=READY`

That is a confirmed false negative. Unsupported factual content must not be
publishable. Page Composition and Page Intelligence stay blocked until this
Content Gate path is safe.

`WEB_ANATOMY_INTEGRATION_NOT_STARTED`

**Lab progress — LP visual optimization patch 01:** Empty-asset hero is
compact on desktop and removed on mobile; hero CTA is on the copy axis and
must be fully visible at 390×844; Overview stays uncollapsed with a lede
and dividers; single-step usage is a compact card. Factual copy, ProductFacts,
and gates are unchanged. Operator validated Visual Patch 01.

**Lab progress — Page Intelligence patch 02:** BUYER_GUIDE Overview moves
immediately after Hero; the existing DIRECT_SOURCE 60-day money-back sentence
is reused near the hero CTA; Overview scan grouping is visual-only. Web Anatomy
recommendations were not treated as ProductFacts. Operator validated Patch 02.

**Lab progress — first grounded premium LP run:** Live re-import of operator
product Joint Genesis from `https://jointgenesisofficial.com/` returned
IDENTITY=ACCEPTED. Copy-eligible ProductFacts were thin (description +
features only). One production generation (`REVIEW`) returned
GROUNDING=UNGROUNDED, POLICY=BLOCKED, CONTENT_GATE=BLOCKED. Composition,
Visual QA, and Web Anatomy were not executed. Gates were not weakened.
Awaiting operator review (`GENERATION_SAFETY_NEEDS_FIX`).

**Lab progress — generation/grounding fact contract:** Generation, Grounding,
and Page Composition share `getConsumerCopyEligibleFacts`
(`GENERATION_GROUNDING_FACT_CONTRACT`). Copy-eligible provenance remains
`DIRECT_SOURCE` and `MANUAL` only. FAQ and raw source snippets stay stored
for diagnostics/research (`FAQ_SOURCE_SNIPPETS_ARE_RESEARCH_EVIDENCE_NOT_COPY_EVIDENCE`)
and are not prompt-visible paraphrase material. `GENERATION_FACT_MANIFEST`
must satisfy `PROMPT_FACT_NOT_COPY_ELIGIBLE=0`. Operator-attested product
identity without a source title/og match is `MANUAL`, not a promotion of
heuristic extraction to `DIRECT_SOURCE`. Deterministic tests first; do not
spend another live generation call until this contract is reviewed.

**Lab progress — generation topic budget:** `GENERATION_TOPIC_BUDGET` /
`GENERATION_PLAN` derive allowed product-specific topics from
`getConsumerCopyEligibleFacts`. `THIN_FACT_MODE` means shorter copy and
omission, not failure. `MISSING_FACT_IS_OMISSION_NOT_CONTENT`.
`FEATURE_FACT_DOES_NOT_GRANT_FIELD_AUTHORITY`.
`MODEL_WORLD_KNOWLEDGE_IS_NOT_PRODUCT_EVIDENCE`. Closed-topic discussion
cannot be READY; Grounding and Policy are not weakened.

**Lab progress — structured evidence-bound generation:**
`STRUCTURED_EVIDENCE_BOUND_GENERATION`. `CODE_OWNS_PAGE_FACT_STRUCTURE`.
`MODEL_FILLS_AUTHORIZED_BLOCKS_ONLY`. `EVIDENCE_ID_IS_DECLARATION_NOT_PROOF`.
`GROUNDING_REMAINS_FINAL_FACTUAL_VALIDATOR`. `SPARSE_EVIDENCE_MAY_PRODUCE_SPARSE_COPY`.
One Anthropic call per candidate. Malformed/unknown-block/unknown-evidence
output is fail-closed.

**Lab progress — structured generation precision:**
FAQ `topic` is a canonical GenerationPlan id (`identity|description|features|…`),
not free text. Generic ingredient wording in eligible description/features is
`GENERIC_INGREDIENT_RESTATEMENT`, not `NAMED_INGREDIENT`, and is not automatically
`CLOSED_TOPIC=ingredients`. THIN FAQ answer budget remains 35 words (Run 04
answers were 38/36 with compressible filler). Do not live-generate until this
patch is reviewed.

**Lab progress — evidence scope hardening:**
FAQ topic is FIELD-EXACT (description cites description IDs only). FAQ parent
is a container (`evidenceIds` may be empty); each FAQ item owns evidence and
is grounded in child scope. Feature temporal wording is not usage authority.
Generic ingredient restatement cannot add unsupported relational language
(`UNSUPPORTED_RELATIONAL_EXPANSION`). Run 05B replay remains FAIL. Do not
live-generate until this patch is reviewed.

**Lab progress — evidence slot generation:**
CODE owns block, topic, and evidence assignment via `createEvidenceSlotPlan`.
The model fills preassigned slots with conservative wording only.
`MODEL_CHOOSES_EVIDENCE=NO`. `MODEL_CHOOSES_FAQ_TOPIC=NO`. Feature slots are
`FEATURE_DESCRIPTION`, not USAGE. `COMPOSITION_PROMOTION` blocks
includes/contains/formulated-with antioxidants when ingredients are closed.
One Anthropic call still contains all slots. Do not live-generate until this
patch is reviewed.

**Lab progress — claim-level evidence projection:**
Copy-eligible fields are split into claim units at generation time.
Closed semantic spans (usage instruction, heuristic guarantee, etc.) are
excluded from model-visible slot input. ProductFacts storage is unchanged.
Run 07 replay remains FAIL. Do not live-generate until this patch is reviewed.

**Lab progress — claim projection precision:**
Guarantee-like spans inside copy-eligible description (including ambiguous
`180-day vendor`) are classified independently and hidden when guarantee is
CLOSED. Closed-claim firewall audits model-facing text. ProductFacts and
Evidence Manifest are unchanged. Do not live-generate until reviewed.

**Lab progress — Controlled Ready Run 08:** Fresh Joint Genesis live run
after claim-level projection. Pre-AI projection VALID, closed-claim
firewall 0, AI_CALLS=1. CONTENT_READY_MILESTONE=NO (FAQ002 word budget;
FAQ questions ungrounded). No compose, Visual QA, publish, or commit.

**Lab progress — FAQ question semantics + relational precision:**
FAQ questions use deterministic semantic validation (neutral information
requests vs presuppositions). Answer Grounding and the 35-word FAQ budget
are unchanged. Relational "work together" is detected without requiring
the word ingredients; unsupported expansion still requires missing
entailment. Do not live-generate until reviewed.

**Lab progress — Controlled Ready Run 09:** Fresh Joint Genesis live run
after FAQ question semantics. Pre-AI projection VALID, closed-claim
firewall 0, AI_CALLS=1. FAQ questions PASS, FAQ answers GROUNDED, FAQ
word budgets PASS. CONTENT_READY_MILESTONE=NO (editorial expansion +
unsupported relational drift in S003/S005/S006). No compose, Visual QA,
publish, or commit.

**Lab progress — THIN semantic closure:** THIN_MODE generation uses a
deterministic conservative rewrite contract. Grammar/compression are
allowed; new predicates, inferred audience/purpose, relationship
transforms, and editorial characterizations fail. FINAL_THOUGHTS is
summary-only. OVERVIEW and FINAL_THOUGHTS are optional in THIN. Grounding
is unchanged. Do not live-generate until reviewed.

**Lab progress — Controlled Ready Run 10 (generation freeze decision):**
Fresh Joint Genesis live run of the THIN conservative-rewrite
architecture. Pre-AI projection VALID, closed-claim firewall 0,
PROMPT_FIREWALL=PASS, AI_CALLS=1. STRUCTURE=PASS, SEMANTIC_AUTHORITY=PASS.
CONTENT_READY_MILESTONE=NO: FAQ002 question
UNSUPPORTED_FACTUAL_PRESUPPOSITION; S001 headline RELATIONSHIP_TRANSFORMATION
("Approach to") and UNGROUNDED; FAQ002 answer editorial "practical daily".
THIN_MODEL_REWRITE_RELIABLE=NO. GENERATION_ARCHITECTURE=NOT_FROZEN. No
compose, Visual QA, publish, or commit.

**Lab progress — THIN deterministic generation V1:** THIN/INSUFFICIENT
consumer copy is generated deterministically from authorized projected
claims. Claude is not used for THIN factual copy (`THIN_ANTHROPIC_CALLS=0`).
RICH/ADEQUATE still use the existing model generator. Downstream Structure,
FAQ semantics, Semantic Closure, Semantic Authority, Grounding, Policy,
and Content Gate are unchanged and not bypassed. Do not live-generate
until reviewed.

**Lab progress — Controlled Ready Run 11 (first deterministic THIN E2E):**
Fresh Joint Genesis. IDENTITY=ACCEPTED, COVERAGE=THIN, closed-claim
firewall 0, GENERATION_ROUTE=DETERMINISTIC_THIN, ANTHROPIC_CALLS=0,
METHOD=DETERMINISTIC_THIN. STRUCTURE=PASS, FAQ=PASS, SEMANTIC_CLOSURE=PASS,
SLOT/GLOBAL GROUNDING=GROUNDED, POLICY=READY, production CONTENT_GATE=READY.
CONTENT_READY_MILESTONE=NO: SEMANTIC_AUTHORITY=FAIL (NAMED_INGREDIENT_CLAIMS
on source-preserved F004 “ingredients” joined with “Joint Genesis”). No
hydrate, compose, Visual QA, publish, or commit. THIN_GENERATION_ARCHITECTURE=NOT_FROZEN.

**Lab progress — named-ingredient slot-join precision:**
`ingredient(s) + ProperName` cannot span newlines. Concatenating S001
(`...ingredients`) with S002 (`Joint Genesis...`), or S005 (`The ingredients
also...`) with another `Joint Genesis` block, is not a named-ingredient
claim. Same-line `ingredients Mobilee` / `Contains Mobilee` still is.
Semantic Authority scans slots independently; it does not join fills into
one claim span. Do not live-generate until reviewed.

**Lab progress — Controlled Composition + Visual Run 12:** Fresh Joint
Genesis. IDENTITY=ACCEPTED, COVERAGE=THIN, DETERMINISTIC_THIN,
ANTHROPIC_CALLS=0, GENERATION_CODE_CHANGED=NO, architecture FROZEN_V1.
Pre-composition CONTENT_GATE=READY (STRUCTURE/FAQ/CLOSURE/AUTHORITY/
GROUNDING/POLICY PASS). Composition injected raw ProductFacts feature
bullets including closed usage span `take once each morning`.
POST_COMPOSITION GROUNDING=UNGROUNDED, FINAL_CONTENT_GATE=BLOCKED. No
Visual QA, publish, or commit.

**Lab progress — Composition fact firewall:** Downstream composition may
not fall back to raw ProductFacts for consumer-visible factual copy.
Composition uses validated generated variant copy only (identity name
and copy-eligible product image remain). Sparse omitted sections are
valid. Structural UI headings are not factual adapter delta. Replay
Run 12 fills without regeneration. Do not mark complete until the
operator reviews.

**Lab progress — Controlled Visual Run 13:** Fresh Joint Genesis
production path. IDENTITY=ACCEPTED, COVERAGE=THIN,
GENERATION_ROUTE=DETERMINISTIC_THIN, ANTHROPIC_CALLS=0,
CONTENT_GATE=READY, COMPOSITION_FACT_FIREWALL=PASS,
POST_COMPOSITION GROUNDING=GROUNDED, POLICY=READY,
FINAL_CONTENT_GATE=READY. Internal `/visual-frame` only; `/p/` 404.
Visual QA: no overflow/clipping/broken assets; FAQ opens; preview CTA
does not hop. Screenshots under
`data/controlled-ready-13/2026-09-21-controlled-visual-13/screenshots/`.
No publish, no generation/composition patch, no commit.

**Lab progress — Premium Visual System V1 / Patch 01:** Presentation-only
upgrade of the Run13 READY LP. Factual architecture remains frozen.
No publish, no deploy, no commit. Operator review required.

**Lab progress — Premium Visual System V1 / Patch 02:** Human-review
presentation pass on the Run13 READY LP. Overview copy/packshot
duplication removed. No generation or safety-rule changes. No publish,
deploy, or commit. `PREMIUM_VISUAL_SYSTEM_V1=FROZEN`.

**Lab progress — Multi-Product Validation Lab V1:** Operator set
executed (Joint Genesis reference + Yu Sleep, prodentim, Audifort,
Neuro Serge). No product-specific patches. No publish/deploy/commit.
Frozen suites still pass. Only Joint Genesis reached
`FINAL_CONTENT_GATE=READY`. GO=`GENERIC_FIX_REQUIRED` (MODEL RICH
route produced editorial/manufacturer copy; CONTENT_GATE blocked it).
Await human review.

**Lab progress — MODEL_ROUTE_EVIDENCE_SLOT_AUTHORITY_V1:** Generic
MODEL/RICH generation architecture patch. Code owns per-slot authority;
the model owns wording only. Not a ProDentim product patch. Frozen
THIN / Composition Fact Firewall / Premium Visual remain unchanged.
No composition, publish, deploy, or commit. Operator review required.

**Lab progress — SLOT_PROJECTION_ISOLATION_V1:** Generic MODEL
pre-generation authority patch. Each MODEL slot receives only claims in
its semantic domain; dedicated open fields own usage/guarantee/etc.
FAQ, Overview, and Final Thoughts get field-local authority. THIN is
not routed through this layer. Pre-model assertion blocks
`SLOT_PROJECTION_AUTHORITY_VIOLATION`. Adversarial A–J and existing
ModelSlotAuthority / THIN suites pass. One C1 recovered-facts MODEL
replay (`ANTHROPIC_CALLS=1`) with no live fetch, no composition, no
Web Anatomy, no Experiment B / Premium V1 change. Operator review
required. No publish, deploy, or commit.

**Lab progress — MODEL_WORDING_CONSTRAINT_V1:** Generic MODEL-output
entailment constraint. Slot wording must be a conservative transform of
authorized evidence. Fail-closed `MODEL_WORDING_CONSTRAINT_VIOLATION`.
Does not run on THIN. Does not weaken existing validators. Does not
retry. F14 policy-right expansion is a mandatory catch. Operator review
required. No publish, deploy, or commit.

**Lab progress — FAQ_SLOT_AUTHORITY_ALIGNMENT_V1:** FAQ question
semantics follow the pre-assigned authority of that FAQ item only.
Usage and guarantee questions are not globally allowed. Identity,
description, and feature FAQs stay closed to those topics. Question
wording still cannot strengthen policy or add ease-of-use. No Anthropic
call. No publish, deploy, or commit.

**Lab progress — SEMANTIC_AUTHORITY_PRECISION_V1:** Detector precision
for three confirmed false positives. `help` matches an authorized
support relation only in the same sentence, with the same object and
no new actor or stronger outcome. `practical mobility goals` is allowed
only when the same evidence already has practical goals plus movement
activities. `directions` stays a usage token; aspect/angle context is
not dosage language. No global allowlist. No Anthropic call. No
publish, deploy, or commit.

**Lab progress — PAGE_LEVEL_FAQ_AUTHORITY_PROPAGATION_V1:** Page-level
grounding uses the FAQ item authority already assigned at slot
construction. Usage and guarantee questions stay authorized only for
the item that owns that field. Identity, description, and feature FAQs
stay closed. Question strengthening stays blocked. S003 synergy and
policy repetition are unchanged. No Anthropic call. No publish, deploy,
or commit.

**Lab progress — PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1:** MODEL output
cites authorized proposition IDs. The ID is not proof. Wording still
passes Model Wording Constraint, ModelSlotAuthority, and Grounding
against the cited proposition text. A support-coordination sentence can
split into separate support objects plus a trailing with-phrase.
Unbound content fails closed. THIN does not use this contract. No
Anthropic call. No publish, deploy, or commit.

**Lab progress — MODEL_INPUT_TRACE_V1:** Controlled MODEL runs can
persist `model-input-trace.json` from the provider body immediately
before the call. The artifact stores that system prompt, user prompt,
model, and proposition-bound schema, plus the slot structures already
interpolated into the prompt. It does not include API keys, headers, or
ProductFacts that were not in the provider input. A requested write that
fails aborts before the provider call. Production generation does not
request a trace. Policy repetition is unchanged. No Anthropic call. No
publish, deploy, or commit.

**Lab progress — OPTIONAL_FINAL_THOUGHTS_V1:** A MODEL closing slot is
created only when it has an authorized proposition that no primary body
slot already owns. FAQ may still reuse a proposition. The page validator
requires FINAL_THOUGHTS only when that slot is in the evidence plan.
THIN generation is unchanged. No Anthropic call. No publish, deploy, or
commit.

**Lab progress — MODEL_CONSERVATIVE_REALIZATION_V1:** The MODEL prompt
now asks for conservative linguistic realization of authorized
propositions. FAQ question intent is assigned from the slot authority
and still has to pass the existing question validator. MODEL word
budgets shrink to the projected evidence size. Proposition-only fills
hydrate into the planned sections. Validators are unchanged. No
Anthropic call. No publish, deploy, or commit.

**What this lab is**

Admin `/admin/validation` + comparison view. Validation runs persist separately from campaign analytics. Each candidate records IMPORT → FACTS → AI CONTENT → GROUNDING → POLICY → DESIGN PLAN → CREATIVE COMPOSITION → DESKTOP/MOBILE RENDER → VISUAL QA → PERFORMANCE QA. Failures stay visible. First batch is diagnostic: do not auto-redesign the engine for quality issues.

**Isolation**

Validation frames (`/visual-frame/validation/[candidateId]`) are draft/internal/noindex. No PAGE_VIEW, no pixel, no CTA beacon, no live affiliate hop. Human review `PENDING|ACCEPTED|REJECTED` does not publish and does not bypass CONTENT_GATE.

**Source resolution:** If the operator URL is HTTP 403 / access denied / robots-blocked / anti-bot, do **not** bypass that URL. The real **Import facts** button on Presell Content Engine V2 (`importProductAction` → `executeGenerateImport`) must run product-name web discovery using the operator-entered Product name field. Every external HTTP call in that pipeline has a bounded timeout (primary 10s, search 10s, alternative sources 8s, global 45s) with concurrency 3; a slow candidate is skipped as `FETCH_TIMEOUT` and must not stall the operator. Search hits are identity-checked (`ACCEPTED` vs `IDENTITY_UNCERTAIN`) before they contribute ProductFacts. Manual facts remain last resort.

**ProductFacts semantic quality:** ACCEPTED means the page is about the named product, not that it is official or scientifically verified. Extractor + merge must keep field semantics: marketing claims are not ingredients; CTA/sales copy is not description; label-only “see the bottle” is not usage; “well-tolerated” is not a caution. Prefer `NOT_FOUND` over a wrong field. Merge preserves provenance (`HEURISTIC_EXTRACTION` is never promoted to `DIRECT_SOURCE`). `importQuality` counts only semantically kept fields; `PARTIAL` is acceptable. **Backlog `PRODUCT_FACT_SCALAR_CONFLICT_RESOLUTION`:** conflicting `DIRECT_SOURCE` scalars (60-day vs 180-day guarantee) still keep first-source today; do not implement conflict handling in the content-validation precision patch. Policy `health.consult_professional`, `health.medication_advice`, and `health.refund_duration` may WARN as defense-in-depth even when Grounding supports the same copy; WARN is not a grounding failure.

**Market-aware strategy (localhost):** After ProductFacts are grounded, a Market Research agent (existing web-search abstraction, timestamped, freshness `MARKET_RESEARCH_MAX_AGE_HOURS=24`) gathers observable discussion across query families (product, purchase intent, category, questions). Each executed query records an explicit outcome (`SUCCESS`, `SUCCESS_EMPTY`, `SEARCH_TIMEOUT`, `HTTP_ERROR`, `PARSE_ERROR`, `ABORTED`) — search failures are not swallowed or masked as empty success. Market Research owns a DuckDuckGo→Brave fallback separate from Import Facts / Source Resolution: Brave is tried once only after DDG `SEARCH_TIMEOUT`, `HTTP_ERROR`, or `PARSE_ERROR`; `SUCCESS` and `SUCCESS_EMPTY` never call Brave; `ABORTED` never calls Brave. Query selection is round-robin so every family gets a slot before extras. Source class `BRAND` requires identity evidence — “Official” titles are not brand proof. Commerce pathnames (`/shop/`, `/store/`, `/product/`, …) classify as `SELLER` without becoming `BRAND`. Structural forum paths (`/forum/`, `/threads/`, `/community/`, …) classify as `FORUM/COMMUNITY` even on an otherwise editorial host. Structural press-release paths classify as `OTHER`, not independent `EDITORIAL`. Editorial class uses combined path/title signals, not a review-domain allowlist. `OTHER`/`UNKNOWN` do not count toward source-class diversity. HTML entities in titles/snippets are decoded before classification and signals. Quality (`HIGH|MEDIUM|LOW|INSUFFICIENT`) thresholds are unchanged; promotional/affiliate domination keeps both quality and strategy confidence LOW. A Strategy agent recommends one of REVIEW / EDUCATIONAL / BUYER_GUIDE from structured market intents. The recommendation stores an `evidenceTrace` of `MARKET_OBSERVATION`s (not ProductFacts). Generation receives abstract intent labels, not raw SERP titles. Strategy rationale may mention a signal only if it was present. Market research does not overwrite ProductFacts. Recommended LPs still pass grounding, policy, asset, visual, and performance gates. Local preview is `/preview/[slug]/[candidate]`, not public `/p/[slug]`. Human override and alternative strategies remain. Do not simulate campaign outcomes. Market-research diversity work is already in the tree; it does not unlock Page Intelligence.

**Stop point**

Content Gate safety is the current lab gate. Do not start Page Intelligence,
Web Anatomy, LP generation for publication, or production deploy.
`NEXT_ACTION=STOP_FOR_CONTENT_GATE_REVIEW`.

---

### PAGE INTELLIGENCE / LP AUDIT (Web Anatomy)

**STATUS:** PLANNED / DEFERRED  
**WEB_ANATOMY_INTEGRATION_NOT_STARTED**

**PURPOSE (future):** CRO / page-structure audit of a composed LP. Not
factual authority. Do not install Web Anatomy, configure MCP, or implement
this layer while Generation → Grounding → Policy → CONTENT_GATE is still
being validated.

**Planned pipeline position** (after Page Composition, before Visual QA):

```
ProductFacts
    ↓
Market Research
    ↓
Strategy
    ↓
Generation
    ↓
Grounding
    ↓
Policy
    ↓
CONTENT_GATE
    ↓
Page Composition
    ↓
Web Anatomy Audit
    ↓
Playwright Desktop/Mobile QA
    ↓
Visual QA
    ↓
Human Approval
    ↓
Publish
```

**Role:** Web Anatomy is a CRO / page-structure auditor. Possible future
responsibilities (not implemented):

- hero quality
- value proposition clarity
- CTA structure
- information hierarchy
- section structure
- readability
- trust opportunities
- conversion patterns
- desktop/mobile page review
- comparison with page/CRO best practices

Web Anatomy is **not** a ProductFacts source and **not** a substitute for
Grounding or Policy.

**Hard safety boundary**

```
WEB_ANATOMY_RECOMMENDATION != PRODUCT_FACT
```

Web Anatomy must never:

- create ProductFacts
- overwrite ProductFacts
- bypass Grounding
- bypass Policy
- invent testimonials
- invent ratings
- invent manufacturer authority
- invent medical claims
- invent pricing
- invent guarantees
- invent scarcity
- invent statistics
- invent social proof

Example: a recommendation to “Add social proof” does **not** authorize
testimonials. The system must first check whether copy-eligible grounded
ProductFacts exist. If they do not, the item may remain an optimization
opportunity and must not be automatically implemented as factual copy.

**Authority order** (Page Intelligence is last; it cannot override gates):

```
ProductFacts
    ↓
Grounding
    ↓
Policy
    ↓
Content Gate
    ↓
Page Intelligence recommendations
```

A CRO recommendation cannot make an unsupported claim acceptable.

**Future architecture (documentation only — do not implement schema now)**

Planned component: `PAGE_INTELLIGENCE`.

Possible inputs: rendered LP, desktop screenshot, mobile screenshot, page
DOM/structure, Web Anatomy audit, Playwright results, Visual QA results.

Possible output: `PageAuditResult` with conceptual fields such as `status`,
`findings`, `severity`, `category`, `recommendation`, `autoApplicable`,
`requiresGroundedEvidence`, `source`.

**Future integration options (do not configure now)**

- **MODE A — open-source skills:** use Web Anatomy skills locally / through
  the supported coding-agent workflow. Purpose: initial evaluation with
  minimal integration.
- **MODE B — Web Anatomy MCP:** optional later access to richer/live
  benchmark information. MCP is optional.

**Auto-optimization rule (future)**

A Web Anatomy recommendation may only be applied automatically when:

1. it is structural / non-factual, **or**
2. every factual element required by the recommendation already exists as
   copy-eligible grounded ProductFacts,

**and**

3. the resulting content passes Grounding, **and**
4. the resulting content passes Policy.

Potentially structural (no new facts): CTA position, spacing, section order,
heading hierarchy, visual emphasis, mobile layout.

Requires grounded evidence: testimonials, guarantees, product benefits,
manufacturer authority, ratings, statistics, medical statements, pricing,
discounts.

Deferred because the current lab priority is validating Generation →
Grounding → Policy → Content Gate before Page Composition / LP optimization.

---

### PHASE 10 — Experimentation & conversion analytics

**STATUS:** PLANNED / FUTURE

Controlled experiments (template, CTA placement, content strategy) and funnel analysis: visits, unique sessions, CTA sessions, CTR, attributed sales, CTA→Sale, net commission, conversion rate.

Do not auto-select winners without statistically meaningful data. Do not fabricate significance.

### PHASE 11 — Traffic / Ads integration

**STATUS:** FUTURE / NOT YET DESIGNED

Possible later: Google Ads reporting, spend import, CPC/CPA/ROAS, keyword/ad correlation.

**Do not** automatically launch ads in the current roadmap.  
**Do not** build suspension-evasion, cloaking, fingerprinting, reviewer branching, multilogin evasion, or reserve-account activation.  
Any future Ads integration must keep destination integrity (ad URL = this app’s `/p/[slug]`).

---

## Phase dependency map

Logical dependencies (implement / regress in this order even if original product phases landed in a different chronological sequence):

```
Phase 1 Trust
   ↓
Phase 2 Policy
   ↓
Phase 2.5 Publication
   ↓
Phase 3 Content
   ↓
Grounding + Health Linter patch
   ↓
Phase 4 Tracking
   ↓
Phase 5 ClickBank Attribution
   ↓
Phase 6 Page Builder
   ↓
Phase 7 Visual QA
   ↓
Phase 8 Intelligent Page Designer + Auto Visual Optimization
   ↓
Phase 8.1 Premium Art Direction & Asset Intelligence
   ↓
Phase 8.2 Creative Composition Engine
   ↓
Phase 9 Production Readiness  (implementation complete; deployment PAUSED_BY_OPERATOR)
   ↓
LOCAL PRODUCT & LP VALIDATION LAB  ← CURRENT
   (Generation → Grounding → Policy → CONTENT_GATE must be safe first;
    first real generation had GROUNDED/READY false negatives)
   ↓
Page Composition (blocked until Content Gate is validated)
   ↓
PAGE INTELLIGENCE / LP AUDIT (Web Anatomy)  — PLANNED / DEFERRED
   WEB_ANATOMY_INTEGRATION_NOT_STARTED
   ↓
Playwright Desktop/Mobile QA → Visual QA → Human Approval → Publish
   ↓
Phase 10 Experimentation
   ↓
Phase 11 Ads Integration (future)
```

JSON-generation and importer patches sit on Phase 3 and remain required by later phases.

---

## Non-regression contract

Future work must **never** silently break:

- Draft isolation and real public 404 for unpublished slugs
- Preview analytics exclusion (no PAGE_VIEW, no production CTA counts)
- Pixel exclusion from preview (`renderPixel` only on published `/p/[slug]`)
- CTA failure-safe navigation (measurement must not block the hop)
- Same-tab affiliate navigation
- `rel="nofollow sponsored"`
- ClickBank `extclid` (not `tid`)
- ClickBank INS attribution, refunds, rebills, UNATTRIBUTED storage
- Grounding Validator and Policy Linter (and their composed final gate)
- Publication gates: BLOCKED cannot publish; REVIEW_REQUIRED needs explicit confirm
- Affiliate disclosure and public trust pages
- `robots.txt` / canonical / draft non-indexable metadata
- Legacy campaign markdown rendering
- Incremental database migrations (no destructive recreate of `data/presell-os.db`)
- Existing regression suites: `scripts/test-phase1-trust.ts`, `test-policy-linter.ts`, `test-publication-workflow.ts`, `test-content-engine.ts`, `test-generate-variants.ts`, `test-import-product.ts`, `test-source-resolution.ts`, `test-import-action-e2e.ts`, `test-grounding-validator.ts`, `test-parse-ai-json.ts`, `test-analytics.ts`, `test-clickbank.ts`, `test-affiliate-url.ts`, `test-markdown.ts`, `test-slugify.ts`, `test-page-builder.ts`, `test-visual-qa.ts`, `test-design-system.ts`, `test-phase-8-1.ts`, `test-phase-8-2.ts`, `test-phase-8-2-final.ts`, `test-phase-8-2-acceptance.ts`, `test-phase-9.ts`, `test-validation-lab.ts`

Run **all** of those suites plus typecheck and production build before calling a phase done.

---

## Production requirements (preview of Phase 9)

| Item | Notes |
|---|---|
| HTTPS origin | `PUBLIC_SITE_URL` |
| Contact | `PUBLIC_CONTACT_EMAIL` |
| Site name | `PUBLIC_SITE_NAME` |
| Claude | `ANTHROPIC_API_KEY` |
| ClickBank INS | `CLICKBANK_INS_SECRET`; endpoint `/api/clickbank/ins` |
| SQLite | Persist `data/presell-os.db` (or migrate to a hosted DB later) |
| Images | Persist `data/product-images/` or replace with object storage; do not hotlink third-party images permanently if avoidable |
| Process | Node 20+; `better-sqlite3@11.10.0` is pinned for this Windows/Node combo |

---

## Known limitations

- Policy READY ≠ ads-platform approval.
- ProductFacts during generate are session-scoped except the Phase 6 `sourceFactsJson` snapshot.
- Importer can still be PARTIAL/INSUFFICIENT on thin or JS-heavy source pages.
- Grounding is deterministic text matching against supplied facts, not a human fact-check.
- Page Builder composer is **deterministic** (reorganizes/summarizes supplied copy; must not invent claims). FAQ accordion only appears when the variant has parseable `question? answer` items.
- Local image store is unsuitable as-is for multi-instance production without persistent disk or object storage.
- Admin 390px preview toggle does not change CSS viewport media queries; real sticky-CTA behavior is viewport-based (`md:hidden`).
- Phase 5 live INS ping in the operator’s ClickBank account is still an operator validation item.
- Phase 6 is **not** complete until the operator confirms it in the browser.
- Visual QA technical audit is Playwright heuristics, not a full Lighthouse run. A clean technical audit does not imply PREMIUM_INTERNATIONAL visual readiness.
- Visual QA screenshots are ephemeral local files (`data/visual-qa-tmp/`); production should use short-lived object storage, never SQLite blobs.
- Multimodal review requires `ANTHROPIC_API_KEY` and can still miss issues. Missing AI is REVIEW_REQUIRED, never PASS.
- Phase 8 does not invent product packshots. A stored DIRECT_SOURCE file can still be an unusable banner; Visual QA stays REVIEW_REQUIRED with ACQUIRE_PRODUCT_IMAGE.
- Design planner is deterministic; it does not restyle by copying third-party sites.
- Phase 8.1 still cannot fabricate official packshots. Missing photography uses an editorial empty-asset hero, not a fake package. After the acquisition patch, unknown HTML dimensions are probed; a real source packshot is materialized as `DIRECT_SOURCE`.
- Phase 8.2 composes existing grounded copy into scenes. It does not invent steps, quotes, or packshots. Human review of AFTER screenshots is required.
- Page Intelligence / Web Anatomy is **PLANNED / DEFERRED**. `WEB_ANATOMY_INTEGRATION_NOT_STARTED`. A CRO recommendation is not a ProductFact and cannot bypass Grounding, Policy, or CONTENT_GATE. First real generation still showed GROUNDED/READY false negatives; Generation/Grounding are not complete.
- `PRODUCT_FACT_SCALAR_CONFLICT_RESOLUTION` (backlog, **not implemented**): conflicting `DIRECT_SOURCE` scalar facts (example: 60-day vs 180-day guarantee) currently keep first-source as the copy-eligible value without conflict handling. Conflicting scalars must not silently become a single authoritative fact. Do not treat current first-source behavior as resolved.

---

## Definition of the finished product

An operator should eventually be able to:

1. Choose an affiliate product  
2. Provide / import its source  
3. Provide the affiliate URL  
4. Import trustworthy ProductFacts  
5. Generate grounded content  
6. Automatically validate claims (grounding + policy)  
7. Select content strategy  
8. Select visual template  
9. Automatically build a professional responsive presell  
10. Automatically run Visual QA  
11. Automatically fix **safe visual** defects  
12. Preview desktop / mobile  
13. (Future) Page Intelligence / Web Anatomy LP audit — CRO/structure only; never ProductFacts  
14. Approve  
15. Publish  
16. Use the public URL for traffic  
17. Track visits and CTA clicks  
18. Attribute ClickBank sales / refunds  
19. Analyze conversion performance  

The operator should not need to manually build the landing page.

---

## Roadmap maintenance rule

At the end of every future phase:

1. Update `docs/ROADMAP.md`.
2. Change the phase status.
3. Record important architecture decisions.
4. Record migrations.
5. Record new dependencies.
6. Record the latest regression baseline.
7. Add newly discovered known limitations.
8. Add the next **approved** phase (do not invent unapproved scope).
9. Never delete historical phase information merely because the implementation changed.
10. Keep the roadmap useful to a new AI agent with no prior chat context.

Also keep the matching `docs/PHASE_*.md` file and the status row in `docs/ROADMAP_FASES.md` in sync. Do not mark a phase complete unless the operator ran it in a real environment.
