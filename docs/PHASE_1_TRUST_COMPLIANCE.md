# Phase 1 — Trust & Compliance Foundation

This is the **trust/compliance** Phase 1 (not the original product Phase 1
in `ROADMAP_FASES.md`). Product Phases 1–8 in that roadmap stay as they are.

## 1. What was implemented

- Public legal/info pages: `/about`, `/contact`, `/privacy`, `/terms`,
  `/affiliate-disclosure`.
- Crawlable footer (About, Contact, Privacy Policy, Terms, Affiliate
  Disclosure) on public presells (`/p/[slug]`), those legal pages, and `/`.
- Footer is **not** on `/admin` (admin keeps its own layout). Preview
  (`/admin/preview/[slug]`) does not include the public footer so admin
  chrome and public chrome stay separate.
- Review template: same-tab affiliate CTA (`rel="nofollow sponsored"`),
  editorial “How we review products” block, optional mild health
  disclaimer.
- Structured review sections are still optional `## ` headings. Old
  campaigns with `## Benefits` / intro paragraphs keep rendering.
- Public presell metadata: title, description (first body paragraph),
  canonical URL, `index,follow`.
- Viewport is explicit on the root layout.
- `robots.ts`: allow `/`, disallow `/admin`. Does not disallow `/p/` or
  AdsBot.
- Admin layout: `noindex,nofollow` so the internal UI is not treated as
  public content.
- AI prompt and campaign-form help text recommend the richer section set
  without requiring it.

## 2. Files changed

- `src/components/campaign-template.tsx`
- `src/app/p/[slug]/page.tsx`
- `src/app/layout.tsx`
- `src/app/admin/layout.tsx`
- `src/app/page.tsx`
- `src/app/admin/campaign-form.tsx`
- `src/lib/ai/generate-variants.ts`
- `scripts/test-markdown.ts`
- `scripts/test-generate-variants.ts`
- `.env.example`
- `tsconfig.json`

## 3. Database migrations

None. Campaign schema is unchanged. No category taxonomy was added.

## 4. New environment variables

All optional (documented in `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_SITE_NAME` | `Product Reviews` | Public brand string on legal pages/footer |
| `PUBLIC_CONTACT_EMAIL` | `contact@example.com` | Contact page + privacy/terms mailto |
| `PUBLIC_SITE_URL` | `http://localhost:3000` in dev | Absolute origin for canonical URLs |
| `PUBLIC_HEALTH_DISCLAIMER` | on (set `false` to hide) | Site-wide mild informational disclaimer |

## 5. Routes created

- `GET /about`
- `GET /contact`
- `GET /privacy`
- `GET /terms`
- `GET /affiliate-disclosure`
- `GET /robots.txt` (via `src/app/robots.ts`)

## 6. Tests created

- `scripts/test-phase1-trust.ts` — footer/CTA/tracking unit checks plus HTTP
  checks against `PHASE1_BASE_URL` (default `http://localhost:3000`).
- Extra assertions in `scripts/test-markdown.ts` (raw HTML in body stays
  text) and `scripts/test-generate-variants.ts` (new section headings in
  the prompt).

Run (dev server must be up for the HTTP half):

```bash
npx tsx scripts/test-phase1-trust.ts
npx tsx scripts/test-markdown.ts
npx tsx scripts/test-affiliate-url.ts
```

## 7. Known limitations

- No campaign **categories**, so the health disclaimer is site-wide, not
  “health/supplements only”. Enable/disable with `PUBLIC_HEALTH_DISCLAIMER`.
- No email backend / contact form. Contact is a `mailto:` address.
- `/` is still the internal Afiliado IA placeholder, not a public magazine
  homepage. It now has the public footer.
- Markdown still does not render extra sections as a special layout —
  `## Key Features` is the same `<h2>` as any other heading. That is
  intentional backward compatibility.
- Pixel `headScript` still uses `dangerouslySetInnerHTML` (operator-pasted
  snippet only, public `/p/` only). Campaign **body** is never HTML.
- `PUBLIC_CONTACT_EMAIL` defaults to `contact@example.com` until you set a
  real address.
- No GDPR/CCPA implementation, CMP, or cookie banner.
- Google Ads API, automation, auth, analytics dashboards, cloaking: not
  in this phase.

## 8. Manual verification steps

1. `npm run dev` → open `/about`, `/contact`, `/privacy`, `/terms`,
   `/affiliate-disclosure` — 200, English copy, footer links work.
2. Open `/p/{existing-slug}` — footer visible, “How we review products”
   visible, CTA same tab, `rel="nofollow sponsored"`.
3. Open `/p/{slug}?utm_source=google&gclid=test` — CTA href includes both.
4. Open `/admin/preview/{slug}` — no public footer, pixel does not fire.
5. Open `/p/does-not-exist` — 404.
6. View source: canonical + meta description on public presell; no
   `noindex` on `/p/`.
7. `/robots.txt` allows `/`, disallows `/admin`.
8. An old campaign with only `## Benefits` still renders.

## 9. Intentionally NOT implemented

- Google Ads API / campaign automation
- Authentication / multi-user
- Analytics dashboards
- Cloaking, UA filtering, popups, JS redirects
- Per-campaign category taxonomy
- Contact form / mail server
- Cookie consent platform
- New npm dependencies
- Database schema changes

## 10. Risks / assumptions from inspection

- Stack: Next.js 15 App Router, React 19, SQLite `data/presell-os.db`,
  Tailwind. Tests are `npx tsx scripts/test-*.ts` (no Jest/Vitest).
- There was **no** `robots.txt` before this phase. A permissive file was
  added so public reviews are crawlable and `/admin` is not.
- Next.js already emitted a viewport meta tag; it is now explicit.
- Affiliate URL is rendered as an `<a href>` from `URL.toString()`; React
  escapes attribute text. Invalid URLs fall back to the raw string (existing
  behavior).
- Preview and public share `CampaignTemplate` so the article (disclosure,
  trust block, CTA) cannot silently diverge. Site footer is public-only.
- `tsconfig.json` excludes `scripts/` from `tsc` because those files use
  `.ts` import suffixes for `npx tsx` (pre-existing). App/source typecheck
  is clean.
