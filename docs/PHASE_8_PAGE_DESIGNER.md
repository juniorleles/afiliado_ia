# Phase 8 — Intelligent Page Designer + Auto Visual Optimization

**STATUS:** implemented in code (operator confirms Apply Design / Auto Optimize in the browser)  
**STANDARD:** `docs/VISUAL_STANDARD.md` (`PREMIUM_INTERNATIONAL`)

Phase 8 consumes Phase 7 Visual QA action codes and changes **presentation only**.
It does not rewrite factual copy, loosen CONTENT_GATE, or publish.

## Architecture

```
ProductFacts + PresellPage + template + assets + Visual QA findings
  → DesignPlan (deterministic planner)
  → Themed renderer (same public components)
  → Visual QA
  → safe action mapping
  → re-render (max 2 iterations)
```

`DesignPlan` is not a second source of product facts.

## Themes and heroes

Visual themes (independent of content templates REVIEW / BUYER_GUIDE / EDITORIAL):

CLEAN, NATURAL, BOLD, EDITORIAL, PREMIUM

Hero variants:

PRODUCT_SPLIT, EDITORIAL_SPLIT, CENTERED_PRODUCT, ASYMMETRIC_PRODUCT

Missing official packshot → `FALLBACK_COMPOSE` (honest placeholder, no AI packshot).

## Optimization loop

`MAX_VISUAL_OPTIMIZATION_ITERATIONS=2`

Stop early on Visual QA PASS, no remaining safe changes, or no severity improvement.
Never force PASS. Never auto-publish.

## Persistence

Incremental columns: `designPlanJson`, `visualTheme`, `designVersion`.
`updateCampaignDesign` does not change `publicationStatus` or campaign copy.

## Admin

Preview: theme + hero selects, **Apply Design**, **Run Visual QA**, **Auto Optimize**.
Shows CONTENT GATE, VISUAL QA GATE, theme, template, iterations, remaining HIGH findings.
