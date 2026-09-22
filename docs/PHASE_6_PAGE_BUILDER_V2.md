# Phase 6 — Page Builder V2

Automatic visual presell generation on top of Content Engine V2.
Selecting a template does **not** publish. Created pages are DRAFT.

## Architecture

- `src/lib/presell-page.ts` — structured `PresellPage` model, deterministic composer, markdown reconstruction for Policy Linter V2 / grounding.
- `src/components/presell/*` — reusable visual components.
- `src/components/campaign-template.tsx` — structured page when `pageComposition` is present; legacy markdown otherwise.
- Campaign columns (incremental): `pageTemplate`, `pageComposition`, `productImageSrc`, `productImageProvenance`, `subheadline`, `sourceFactsJson`.

## Images

Importer reads `og:image` / content images (`DIRECT_SOURCE`). Operator URL is `MANUAL`. Missing images use a neutral `PLACEHOLDER`. The composer never generates a fake packshot.

Local copies (when fetch succeeds) are stored in `data/product-images/` and served at `/media/product/[file]`. Production must persist that directory or replace it with object storage. Remote URLs may remain as a fallback if download fails.

## CTA

Hero, mid-content, guarantee, final, and sticky-mobile CTAs all use `AffiliateCta` with the existing beacon + `extclid` path. Preview never sets `trackClicks` or `renderPixel`.
