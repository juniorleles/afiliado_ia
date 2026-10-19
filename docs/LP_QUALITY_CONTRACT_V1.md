# Nutraceutical LP Quality Contract V1

Status: specification only (Execution 35).  
Template in scope: `PRODUCT_SHOWCASE_PREMIUM_V1` only.  
No second template. No new pipeline. No Product Facts edits.

Reference captures:

- Harbor Capsule lab demo (fictional images, not a campaign): `public/demo-assets/harbor-demo-assets/...`
- NeuroPrime draft 190, admin chrome: `data/evidence/neuroprime-premium-draft-v1/`
- NeuroPrime clean no-image presentation: `data/evidence/neuroprime-no-image-presentation-v1/`

Harbor is a visual reference for rhythm. It is not a factual reference and its crops must never be attached to a real campaign.

---

## 1. Current state

### What already holds

- One consumer renderer: `ProductShowcasePremiumV1`, fed by `buildProductShowcase` / `adaptLandingToShowcase`.
- Hero, CTA, and footer stay structurally required. Benefits are required only when copy-eligible features exist.
- Structural, grounding, and policy stay separate. Structural PASS + grounding PASS is not publication.
- Official image enters only with copy-eligible provenance. Demo paths and rejected assets stay out.
- CTA enters only with a non-educational label and an `http(s)` hop on the presell channel.
- Clean consumer view exists at `/visual-frame/[slug]` (`noindex`, internal). Admin preview keeps diagnosis chrome and links to that view. Drafts stay 404 on `/p/[slug]`.
- No-image hero no longer reserves an empty photo slot and no longer prints “Official image not available”.
- Ingredient names without photos render as type cards, not fake ingredient photos.

### NeuroPrime 190, measured

| Fact | Stored | Shown on clean Premium V1 |
|---|---|---|
| Publication | `draft` | Not public |
| Template | `PRODUCT_SHOWCASE_PREMIUM_V1` | Yes |
| Features | `0`, confidence `NOT_FOUND` | Benefits omitted (correct) |
| Ingredients | 9 names | Yes |
| Usage | 3 lines, `DIRECT_SOURCE`, including format-like lines | Not a format/usage block |
| Price | present, `DIRECT_SOURCE` | Not rendered (model has no price slot) |
| Guarantee | present, `DIRECT_SOURCE` | Yes, and repeated in the no-image hero aside |
| Packshot | none; candidates rejected | Correctly absent |
| Hoplink / CTA label | empty | CTA correctly absent |
| Gates | structural / grounding / policy PASS, publication `HELD` | Unchanged |

The page is professionally quieter than the first preview. It is not at the Harbor rhythm, and it drops eligible commercial and usage facts.

### What NeuroPrime still needs, without fiction

- Show the eligible format and usage once.
- Show the eligible price once, as a restatement.
- Show the guarantee once. The clean preview currently repeats it in the hero aside.
- Keep the editorial hero. Do not invent a packshot, a benefit, a study, or a testimonial.
- Leave the CTA out until a real hoplink exists.
- Keep ingredient type cards until every name has an approved image. None does today.

### Gap classification

| Class | Finding | Not this class |
|---|---|---|
| Insufficient data | No approved packshot. No copy-eligible features. No hoplink. | Price, guarantee, ingredient names, and usage lines exist. |
| Copywriting | Consumer text is a label plus a count. Eligible usage and price never become a specific sentence. The guarantee sentence is repeated. | Do not add benefits, studies, or testimonials to fill the quiet. |
| Visual composition | With a photo, Harbor has a split hero, circular ingredient crops, and a format still. Without a photo, NeuroPrime is one type column plus a count card. Identical ingredient cards and a second guarantee block reduce rhythm. | The missing photo is not a layout bug. |
| Images | Rejected official assets and demo crops are correctly excluded. There is no approved ingredient or format image. | Do not substitute generic botanicals. |
| Template adaptation | `ProductShowcaseModel` has image, ingredients, format, guarantee, FAQ, notices. It has no price, no usage block, and no “commercial limitation” record. Format is inferred only when a characteristic string matches capsule/tablet/softgel/bottle/powder/serving. | Do not fork a NeuroPrime template. |
| Conversion and navigation | In-page links match ingredients and guarantee. There is no authorized hop, so there is no conversion control to judge. About points at the site page, not a product section. | Absence of a button is not a failed journey. |

---

## 2. Visual contract

Applies to `PRODUCT_SHOWCASE_PREMIUM_V1` at 1440, 768, and 390. Consumer view means `/visual-frame/[slug]` or the public presell, never the admin chrome.

### Hero with packshot

- Use the split hero. The image is the official approved packshot only, with a non-empty alt.
- The first screen shows the product name and the image. No second decorative image.
- Gallery thumbnails render only for extra approved images.
- Do not also render the no-image aside.

### Hero without packshot

- Use the editorial hero. Do not render `.psp-hero-media` or any empty aspect-ratio box.
- Allowed content: product name, one short eligible lead, one format line when a format fact exists, chips for other non-repeated eligible highlights, and the affiliate disclosure.
- A composition aside may show the ingredient count only. It must not repeat the guarantee, the price, or a chip already in the hero.
- No sentence that says the image is missing, unavailable, or placeholder.

### Type hierarchy

- One `h1`: the product name.
- Section titles are `h2`. Supporting labels stay uppercase kickers.
- Display face for name, section titles, guarantee, and ingredient names. Body face for disclosure, notes, and notices.
- Do not let a kicker, a chip, and a section title state the same fact.

### Content distribution

Order on the consumer page:

1. Bar (name, in-page links for sections that exist, CTA only when authorized)
2. Hero
3. Ingredients, if any names exist
4. Format and usage, if any eligible lines exist
5. Commercial facts (price and/or guarantee), each at most once
6. Important information and the standing review note
7. FAQ only when every shown pair has an eligible answer
8. Footer

Omit a step when its facts are absent. Do not insert an empty card to keep the grid.

### Ingredients

- Names and count match the eligible ingredient list. Order is the fact order.
- 1–4 names: one row of discrete cards on desktop, stacked on 390.
- 5–9 names: three columns from 768 up, one column at 390.
- 10 or more: compact type list, not a field of equal photo circles, unless every name has its own approved image.
- Photos render only when every visible name has an approved image. Otherwise render type cards and no swatches.
- No generic leaf, powder, or molecule art.

### Format and usage

- A format line is one eligible fact that states capsule, softgel, tablet, drop, powder, serving, or bottle.
- Usage lines that are eligible and distinct from the format line sit in the format/usage block, not in the hero chips.
- If the only usage line is the format line, show it once.

### Commercial information

- Price, when `pricingInformation` is eligible, is one restated line. It is not a discount, a scarcity claim, or a comparison.
- Guarantee, when eligible, is one restated line with the fixed origin “Declared by the product source”.
- Shipping or returns render only as already classified operational facts, restated, never strengthened.

### CTA

- Zero or one hero CTA. No mid-page clone. No sticky bar in V1.
- Label and `https` hop come from the campaign. The builder may override the label only through the existing authorized field path.

### Disclosures

- Affiliate disclosure is visible in the hero.
- Health disclaimer and source cautions stay in Important information when enabled.
- The standing “How we review products” note stays site copy. It is not a product fact and must not name claims.

### Responsiveness

- No horizontal overflow at 1440, 768, or 390.
- 390 uses a single column for hero aside, ingredient cards, and the commercial block.
- 768 may use two columns for the editorial hero and three for a 5–9 ingredient grid.
- Tap targets for the CTA and footer links stay at least 44px tall.

---

## 3. Editorial contract

Product Facts are the only factual authority. `DIRECT_SOURCE` means the source said it.

### Transformation rules

- The product name is the headline. Do not paraphrase it.
- Pick one eligible line as the lead. Prefer a format or identity line of 90 characters or fewer.
- Other eligible feature lines become benefits only when `benefitsStructurallyRequired` is true. One idea per line. Drop a line that repeats the lead.
- Ingredient names are listed, not described, unless an eligible fact already describes that ingredient.
- Usage, price, and guarantee are copied as operational restatements. They do not become outcomes.
- A blocked, `NOT_FOUND`, or closed claim stays omitted. The omission is recorded. It is not rewritten into a softer benefit.

### Narrative shape when facts are thin

A short page is valid. The useful narrative is: what the product is, what it contains, how it is taken if stated, what it costs if stated, what return term the source states, and the standing disclosures.

### Never

- Invent benefits, mechanisms, or “supports” lines.
- Create studies, percentages, or clinical proof.
- Fabricate testimonials, ratings, or expert quotes.
- Invent images, certifications, or seals.
- Fill a section with generic wellness copy.
- Promote Market Intelligence, search snippets, or ad copy into facts. Market Intelligence may inform which eligible fact leads the page. It may not add a fact.

---

## 4. Adaptation matrix

Generic. No `campaignId`, slug, or product branch.

| Condition | Behavior |
|---|---|
| Capsules, softgels, tablets | Format label “Format”. Optional format image only if that crop is an approved asset. |
| Drops | Same slot. Do not reuse a capsule crop. |
| Powder | Same slot. Do not reuse a capsule crop. |
| Format fact absent | Omit the format block and the format nav link. |
| 1–4 ingredients | Sparse type row or approved photo row. |
| 5–9 ingredients | Three-column type grid, or photo grid only if every name has an approved image. |
| 10+ ingredients | Compact type list; photos only under the every-name rule. |
| Approved packshot | Split hero. |
| No approved packshot | Editorial hero. Rejected assets stay rejected. |
| Eligible features | Benefits required. Omission is a structural failure. |
| No eligible features | Omit benefits. Record `NO_ELIGIBLE_FEATURES`. Not a grounding failure. |
| Eligible price | One commercial line. |
| No price | Omit price. Record `PRICE_NOT_AVAILABLE`. |
| Eligible guarantee | One guarantee block. |
| No guarantee | Omit it. Record `GUARANTEE_NOT_AVAILABLE`. |
| Authorized CTA | One hero control. |
| No authorized CTA | No button. Record `CTA_NOT_AUTHORIZED`. |

Limitation codes are diagnostic. They do not change copy, facts, or publication.

---

## 5. Acceptance criteria

### Technical approval

Separate from looking good.

- Document structural gate PASS under the current composer rules.
- Consumer DOM has one `h1`, no admin chrome, no demo-asset URL, no empty hero media.
- No horizontal overflow at 1440, 768, and 390 on `/visual-frame/[slug]`.
- Preview and builder still render this template through `adaptLandingToShowcase` and `showcaseFromBuilderFields`.
- Draft `/p/[slug]` remains 404 until publication status is `published`.

### Visual approval

- A human compares the clean capture with this contract, not with Harbor’s photographs.
- With a packshot, the image is the focal point.
- Without a packshot, the page still has a finished editorial hero and a scannable ingredient treatment.
- The same fact is not shown twice.
- Sections that exist are visually distinct. Missing sections leave no hole.

### Editorial approval

- Every product sentence traces to an eligible fact or to standing site disclosure.
- Eligible price, usage, format, and guarantee are each shown once when present.
- No generic filler.

### Grounding approval

- Existing `validateGrounding` on each consumer-visible line. This contract does not add a second grounding implementation and does not weaken the first.
- Invented, extrapolated, or unauthorized claims fail grounding.

### Responsive approval

- The three captures exist for the product under test and show no overflow and no clipped CTA.

### Reuse approval

- The same rules pass on a fictional capsule with photos and features, and on a fictional powder with no photo, no features, and no CTA.
- Campaigns 186, 188, 189, and 190 keep their facts, blocked-claim firewall, template selection, and publication status unless a later execution is explicitly told otherwise.

### Preview and builder

- Admin preview keeps the diagnosis panel.
- Clean view stays on the internal visual-frame route.
- Builder overrides still pass through the presentation filter before render.

Technical PASS does not imply visual PASS. Visual PASS does not imply publication.

---

## 6. Validation tools

These tools produce evidence. None of them approves Google Ads, predicts conversion, or publishes the page.

| Tool | Owns | Does not own |
|---|---|---|
| Playwright | Render `/visual-frame/[slug]` at 1440, 768, and 390. Assert no overflow, one `h1`, no admin chrome, no empty media slot, CTA presence matching the limitation code, and stable screenshots. | Copy quality, policy, or ads approval. |
| Lighthouse | Performance, accessibility, SEO, and best-practices scores against the internal frame. Evidence for the technical gate and for the 15-point performance dimension. | Conversion, commercial quality, or Google Ads review. A high score with no hop is not a successful journey. |
| Structured editorial check | Compare each consumer line with eligible Product Facts. Count repetitions. Flag generic filler and missing eligible price, format, usage, or guarantee. | New sentences. A failing line is omitted or sent back, never rewritten from world knowledge. |
| Human visual review | Composition, rhythm, and whether the page looks finished without a packshot. Required before a quality PASS is treated as accepted. | Overriding grounding, inventing an image, or publishing. |
| Existing compliance checks | `validateGrounding`, the policy linter, asset approval status, and the affiliate-program record (`brandPpc`, `genericSearchPpc`, `googleAdsPolicy`, `directCheckoutLinking`). | A new policy engine. Google Ads platform approval. |

An AI visual or editorial pass may assist the human review. It is not a gate by itself. It requires an explicit budget before any paid call.

---

## 7. Implementation plan (Executions 36–40)

No new template, no new public route, no rewrite of Content Gate, Grounding, or Policy, no publication change, no asset approval, no paid model call unless that execution states a budget.

| Execution | Contract to implement | Stops before |
|---|---|---|
| 36 Adaptive engine | Encode the decision matrix in `buildProductShowcase`: packshot branch, ingredient-count branch, format kind, feature presence, price, guarantee, CTA. Emit limitation codes. Fictional fixtures only. | Editorial wording and CSS. |
| 37 Editorial engine | Turn eligible facts into one lead, one format line, one usage block, one price line, and one guarantee line. Drop repeats. Keep benefits conditional. Market Intelligence may choose order among eligible facts only. | Renderer layout and the score. |
| 38 Premium renderer and visual/technical validation | Apply the visual contract in the Premium V1 component and CSS, including removing the duplicated guarantee. Playwright captures at 1440, 768, and 390. Lighthouse on the internal frame as evidence, not as a publish signal. | Writing the score into the product and any public route. |
| 39 Quality Gate, end to end | Read-only evaluator. Persist `score.json` plus the three gate results in a new evidence directory. Show them on the existing admin preview diagnosis. | Changing publication status. Treating the score as ads approval. |
| 40 Homologation | Run the same path on fictional capsules, drops, and powder, and on the current drafts that already exist. Confirm facts, templates, asset decisions, and publication status stay put. | Publishing, deploying, or opening `/p/` for drafts. |

Dependencies: 37 consumes the model slots from 36. 38 consumes the editorial model from 37. 39 scores the rendered result of 38. 40 runs 36–39 without product-specific branches.

---

## 8. Risks and dependencies

- Treating Harbor’s photos as a requirement will pressure the system to invent images. The contract forbids that.
- Showing price or usage that fails `validateGrounding` must stay omitted. Eligibility is necessary but not sufficient.
- A high quality score will be misread as permission to publish or as Google Ads approval. The score cannot clear compliance.
- The clean preview repeats the guarantee in the hero aside. Execution 38 removes that repetition, after 36 and 37 have a single slot for it.
- NeuroPrime’s rejected assets must stay rejected even if the design score is capped for lack of a packshot.
- Lighthouse can look strong on a page that has no hop. That is not evidence the page will convert.
- Affiliate-program fields can be `UNKNOWN`. Unknown is not `ALLOWED`. The compliance gate records it and does not start ads.
- Execution 36 depends only on this contract. It does not depend on a Lighthouse run.

---

## 9. LP Quality Gate

Three results are stored side by side. They are not averaged into one verdict.

### TECHNICAL_GATE

Owner: structure, render, responsiveness, and performance.

- PASS when required sections exist, the consumer DOM matches the adaptation matrix, the three viewports do not overflow, and the Lighthouse evidence for the internal frame has no failing overflow or contrast check that this contract lists as blocking.
- FAIL when hero, CTA, or footer is missing, when benefits are missing despite eligible features, when the clean view overflows or shows admin chrome, or when a required image has no alt text.
- A missing Lighthouse run is `REVIEW` for the performance evidence, not a compliance failure and not a conversion result.
- This gate does not score persuasion and does not publish.

### COMPLIANCE_GATE

Owner: grounding, image usage rights, the policy linter, and the affiliate-program record.

- FAIL when any consumer line is not `GROUNDED`, when policy fails, when a blocked claim is visible, when a rejected or demo image is shown as official, or when the page exposes a direct checkout hop while `directCheckoutLinking` is `FORBIDDEN`.
- `brandPpc=BLOCKED` and `genericSearchPpc=UNKNOWN` stay recorded. They do not become ad permission. `googleAdsPolicy` is not an ads-platform approval.
- A numeric score cannot flip this gate.
- PASS here is still not `READY_TO_PUBLISH`. Human publication approval stays required. Drafts stay 404.

### QUALITY_GATE

Owner: the score below. Provisional pass mark: **85 / 100**. The mark can be recalibrated only by editing this contract.

- The gate reports the score, the limitation codes, and `PASS` or `REVIEW`.
- `PASS` means the score is at least 85, no hard quality failure fired, and the human visual review has accepted the captures.
- `REVIEW` means a human must look. It does not block a technical or compliance PASS, and it does not create one.
- Hard quality failures (visible invented claim, unofficial image presented as official, generic filler used as a fact) force `REVIEW` and a zero in the affected dimension. They also fail compliance when they are factual inventions.

### Score

| Dimension | Points | What is scored | How | Evidence | Failure | Human review |
|---|---:|---|---|---|---|---|
| Design and UX | 25 | Hierarchy, hero mode, ingredient treatment, spacing, section rhythm | Deterministic DOM and screenshot checklist against section 2 | Clean captures at 1440, 768, 390 plus a DOM snapshot | Empty media slot, technical missing-image copy, overflow, duplicate guarantee block | When the checklist passes but the page still looks unfinished |
| Copy and commercial clarity | 25 | One idea per fact, no repeated line, eligible price/format/usage/guarantee shown once | Diff of consumer lines against eligible facts | Line list with fact ids | A fact shown twice, or an eligible commercial fact dropped without a limitation code | When wording is awkward but grounded |
| Specific content and credibility | 20 | Names, counts, and operational lines match facts; no studies, quotes, or seals without a fact | Same line list plus omission log | Grounding result per line and the omission log | Any ungrounded line, testimonial, or invented image | When a line is grounded but easy to over-read |
| Performance and accessibility | 15 | Overflow, alt text, contrast of body text, named nav, 44px controls | Deterministic viewport probe. Lighthouse is optional extra evidence for this dimension only | Viewport JSON. Lighthouse report only if a later execution runs it | Overflow, image without alt, unnamed nav | Lighthouse is not required for V1. A missing Lighthouse run does not fail this dimension and says nothing about conversion |
| Conversion journey | 15 | Authorized hop is present and singular, or unauthorized hop is absent and recorded. Nav matches sections. Disclosure is in the hero | CTA predicate plus limitation code | `CTA_NOT_AUTHORIZED` or the hop URL, plus the nav list | A CTA with no valid hop, a second CTA, or a missing CTA when one is authorized | No review can invent a hop. Do not state that the page will convert |

Points inside a dimension are integers. Unscored checks stay at 0 with a reason. The total is the sum.

Absence rules:

- No eligible features and no benefits: no penalty. Record `NO_ELIGIBLE_FEATURES`.
- No authorized CTA: no penalty. Record `CTA_NOT_AUTHORIZED`. The conversion dimension can still reach 15.
- No packshot: no compliance penalty. The design dimension may award the editorial-hero points and must not award packshot points. Record `PACKSHOT_NOT_APPROVED`.

The score never says the landing page will convert. Conversion claims require later observed traffic, which this gate does not collect.

### Evidence required for a score report

A versioned directory under `data/evidence/`, never an overwrite of an older run:

- `score.json` with the five dimensions, total, limitation codes, and the three gate values
- DOM checklist from Playwright
- `clean-desktop-1440.png`, `clean-tablet-768.png`, `clean-mobile-390.png`
- Lighthouse JSON for the internal frame, or an explicit `LIGHTHOUSE_NOT_RUN`
- Consumer line list, the eligible fact id for each line, and the grounding status already produced
- Asset status for every image URL on the page
- Affiliate-program snapshot: brand PPC, generic search, Google Ads policy, direct checkout
- Publication status, left unchanged
- Human visual review: `PENDING`, `ACCEPTED`, or `REJECTED`, with a note. `PENDING` keeps the quality gate at `REVIEW`

### What the score must not do

- Release a compliance block.
- Invent benefits, testimonials, images, or studies to raise the score.
- Penalize a lawful omission of benefits or CTA.
- Treat Lighthouse, or an AI review, as proof of conversion or as Google Ads approval.
- Weaken `validateGrounding`, the policy linter, asset rejection, the affiliate-program record, or the publication hold.

---

## Ready for Execution 36

Yes. Execution 36 implements only the adaptive engine: the decision matrix, limitation codes, and fictional fixtures. It does not restyle the page and it does not start the score.
