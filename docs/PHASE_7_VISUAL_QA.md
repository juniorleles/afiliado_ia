# Phase 7 — Visual QA Agent

**STATUS:** implemented and exercised on the real ProDentim draft (operator still confirms the admin **Run Visual QA** button in the browser)  
**STANDARD:** `docs/VISUAL_STANDARD.md` (`TARGET_VISUAL_STANDARD = PREMIUM_INTERNATIONAL`)

Phase 7 inspects an **actually rendered** presell and returns a visual
gate. It does **not** redesign pages (that is Phase 8).

## Architecture

```
Rendered presell (/visual-frame/[slug])
  → Playwright Chromium (real viewports)
  → Screenshots (full-page JPEG; segmented if too large)
  → Deterministic layout + density analysis
  → Playwright technical/accessibility heuristics (Lighthouse not required)
  → Anthropic multimodal structured review
  → VisualQAReport (PASS | REVIEW_REQUIRED)
  → SQLite visual_qa_reports (JSON only, no screenshot blobs)
```

Chrome-free inspect URL: `/visual-frame/[slug]` (drafts allowed, `noindex`,
robots disallow). Same `CampaignTemplate` as preview/public, with
`renderPixel={false}` and `trackClicks={false}`. Extra header
`x-aia-analytics: skip`.

Admin: **Run Visual QA** on `/admin/preview/[slug]`.

## Finding model

Each finding: `category`, `severity` (`INFO` | `WARNING` | `HIGH`),
`viewport`, `description`, `evidence`, `suggestedPresentationFix`,
`actionCode`, `source` (`deterministic` | `multimodal` | `technical`).

No numeric 87/100 style scores.

## Action codes (Phase 8 handoff)

`REDUCE_VISIBLE_CONTENT_DENSITY`, `PROMOTE_PRODUCT_VISUAL`,
`CREATE_HERO_FOCAL_POINT`, `COLLAPSE_SECONDARY_DETAILS`,
`INCREASE_SECTION_VARIATION`, `IMPROVE_TYPE_SCALE`,
`REDUCE_CARD_REPETITION`, `IMPROVE_CTA_DISTRIBUTION`,
`ADD_VISUAL_ASSET_SLOT`, `IMPROVE_MOBILE_COMPOSITION`,
`ACQUIRE_PRODUCT_IMAGE`, `IMPROVE_PROGRESSIVE_DISCLOSURE`,
`STRENGTHEN_ART_DIRECTION`, `REMOVE_FAKE_TRUST_SIGNAL`.

## Gates

`CONTENT_GATE` and `VISUAL_QA_GATE` stay separate. Visual QA never
changes publication status.

If multimodal AI is unavailable or JSON parse fails:
`VISUAL_QA=REVIEW_REQUIRED` and `AI_VISUAL_REVIEW=UNAVAILABLE|PARSE_FAILED`.
Deterministic findings are still stored.

## Known limitations

- Technical audit is Playwright heuristics, not a full Lighthouse run.
- Screenshot files are local/ephemeral; not durable across hosts.
- Multimodal review needs `ANTHROPIC_API_KEY` and can still miss issues.
- Visual QA does not rewrite layout, copy, or imagery.
