# Phase 2 — Policy Linter V2

This tool is an **internal risk assessment system and does not guarantee
advertising-platform approval.** It must never be described as “Google
approved”, “Google compliant”, “guaranteed approval”, or “safe from
suspension”.

## Architecture

`lintCampaign(campaign, context?)` in `src/lib/policy-linter.ts` is a pure
function. It does not render UI and does not call the network.

- Thresholds live in `src/lib/policy-linter-thresholds.ts`.
- Default structural facts (disclosure always on, CTA rel, footer routes,
  same-tab CTA, no auto-redirect, no crawler branching) come from
  `DEFAULT_LINT_CONTEXT` plus Phase 1 constants in `src/lib/public-site.ts`.
- UI (`/admin/[id]/lint`) only displays the result.

Each check returns:

`{ category, ruleId, status, message, evidence?, suggestion?, blocking }`

Primary decision: `PUBLICATION_GATE` = `READY` | `REVIEW_REQUIRED` | `BLOCKED`.

`legacyRiskScore` (also exposed as `score`) is a leftover 0–100 average
labeled **LEGACY_RISK_SCORE**. It is not the gate.

## Publication state

There is a draft/published column as of Phase 2.5. See
`docs/PHASE_2_5_PUBLICATION_WORKFLOW.md`. Saving a campaign does **not**
make `/p/[slug]` live. The linter gate is consumed by the human Publish
action. This file still describes the linter only.

## Crawler / cloaking inspection

No public-page branching by user-agent, Googlebot, AdsBot, or reviewer
was found. `import-product.ts` sends a static UA only when fetching a
product URL for admin import. `robots.ts` is crawl policy, not cloaking.
Nothing was deleted.

## Categories and rule IDs

### DESTINATION_INTEGRITY
| ID | Typical |
|---|---|
| dest.slug_valid | blocking fail if slug is not URL-safe |
| dest.no_auto_redirect | pass from template (no auto-redirect exists) |
| dest.no_alternate_destination | pass (no crawler branching) |
| dest.public_page | pass (route is always `/p/[slug]`) |

### AFFILIATE_TRANSPARENCY
| ID | Typical |
|---|---|
| aff.disclosure_visible | **blocking fail** if disclosure is not rendered |
| aff.global_disclosure_page | fail if `/affiliate-disclosure` missing from footer registry |
| aff.cta_identifiable | fail if CTA label empty |
| aff.rel_sponsored | fail if rel lacks `sponsored` |
| aff.not_hidden | fail if copy denies the affiliate relationship |

### HEALTH_AND_SENSITIVE_CLAIMS
| ID | Typical |
|---|---|
| health.cure | blocking — cure/heal/miracle/disease reverse |
| health.treat | blocking — treat + named disease |
| health.time_bound | blocking — lose X in Y days / pain in N days |
| health.authority | blocking — FDA / doctor approved / clinically proven. **Attribution does not clear this.** |
| health.guarantee | blocking — guaranteed results / 100% effective |
| health.drug_interaction | blocking — independent medication-interaction advice. Attribution does not make it acceptable. |
| health.inflammation | warn — anti-inflammatory / manage inflammation. Softening (may/can) does not skip review. |
| health.immune | warn — immune function/system support |
| health.respiratory | warn — respiratory or sinus-effect claims |
| health.mechanism | warn — colonization / oral tissue / microbiome causal language |
| health.research_language | warn — research suggests/shows, studies demonstrate |
| health.safety_general | warn — generally safe for healthy individuals |
| health.support_effect | warn — supports/helps + a health object. Ordinary non-health “supports” (e.g. a commute) is not flagged. |

**Seller attribution vs editorial assertion.** Copy such as “The product website states that …” is treated as an attributed seller claim. Attribution is more transparent than an independent editorial assertion, but it is **not** independent verification and does **not** automatically make a claim READY. Strong disease/treatment/FDA/clinical-certainty/guaranteed-outcome claims remain **blocking** even when attributed. Softer health-effect claims remain **warnings** (REVIEW_REQUIRED) even when attributed.

These are **internal advertising-risk flags**, not a statement that Google
will reject the ad.

### UNVERIFIABLE_CLAIMS
No evidence/source field exists on Campaign. Strong claims are treated as
review/block, not as verified facts.

| ID | Typical |
|---|---|
| unv.rank | blocking — #1 / best product / highest rated |
| unv.volume | blocking — millions of customers / thousands of doctors |
| unv.clinical | blocking — clinically/scientifically proven |

Future: an evidence/source model on the campaign. **Not in Phase 2.**

### AD_LANDING_CONSISTENCY
| ID | Typical |
|---|---|
| ad.headline_present | pass if `adHeadline` is empty |
| ad.topic_overlap | fail if overlap < 8%; warn if < 28%; else pass |
| ad.promise_mismatch | fail if a strong proof/ranking phrase is only in the ad |

Deterministic token overlap. No LLM.

### CONTENT_QUALITY
Reports **“Internal thin-content risk”**, never “Google considers this a
bridge page”.

| ID | Typical |
|---|---|
| content.word_count | fail < 20 words; warn < 80 |
| content.cta_density | warn if 3 template CTAs are dense vs word count |
| content.sections | warn if almost no headings/paragraphs |
| content.repetition | warn on duplicated long sentences |

### CTA_AND_LINKS
| ID | Typical |
|---|---|
| cta.not_javascript | blocking — `javascript:` / `data:` |
| cta.http_url | blocking — not http(s) |
| cta.real_anchor | pass (template `<a>`) |
| cta.same_tab | pass (Phase 1 default) |
| cta.no_auto_redirect | pass |
| cta.tracking_propagation | pass (UTM/gclid/fbclid/msclkid still implemented) |

### TRUST_AND_SITE_STRUCTURE
| ID | Typical |
|---|---|
| trust.pages | pass if Phase 1 footer routes are registered (no localhost HTTP) |

### LANGUAGE_QUALITY
| ID | Typical |
|---|---|
| lang.portuguese | blocking — PT words with accent-aware boundaries (`commute` is safe) |
| lang.empty_sections | warn |
| lang.duplicate_headings | warn |
| lang.punctuation | warn — `!!!!` / `????` |
| lang.placeholder | blocking — `[PRODUCT NAME]`, `INSERT HERE`, `Lorem ipsum`, `TODO` |

## Gate rules

- Any **blocking fail** → `BLOCKED`
- Else any warn or non-blocking fail → `REVIEW_REQUIRED`
- Else → `READY`

## Configurable thresholds

See `LINT_THRESHOLDS` in `src/lib/policy-linter-thresholds.ts`.

## AI guardrails

`src/lib/ai/generate-variants.ts` system prompt now also forbids fake
scarcity/countdowns, unsupported medical/authority claims, fabricated
tests, awards, and “#1” rankings. Persuasive angles remain allowed if
honest.

## Limitations / false positives

- Regex cannot understand sarcasm, negation (“does not cure”), or
  synonyms well. “Does not cure arthritis” may still match `cure`.
- Token overlap is not true semantic matching. Synonym-only ads can warn.
- Thin-content thresholds are arbitrary internals.
- Disclosure “always visible” is a **template invariant**. Tests can
  override `disclosureAlwaysRendered` to simulate a missing disclosure.
- The linter cannot know if an FDA/clinical claim is actually true.
- The linter cannot see the live Google Ads creative, only `adHeadline`.
- Public URLs stay live even when the gate is BLOCKED.

## Manual review responsibilities

Operators must still read the page, check the merchant, and decide
whether to run ads. READY means “no heuristic hits”, not “safe”.

## Examples

Factual winter-jacket review, valid https hop, no ad mismatch → READY.

“Cures arthritis” / “FDA approved” / `javascript:alert(1)` → BLOCKED.

Short but non-empty copy → REVIEW_REQUIRED (thin-content warn).

## Tests

`npx tsx scripts/test-policy-linter.ts`

Phase 1 suite must still pass (`scripts/test-phase1-trust.ts` needs a
running app on port 3000).
