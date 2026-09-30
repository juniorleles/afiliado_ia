# Production deployment

This document is the Phase 9 operator checklist. It does **not** deploy the
app, change DNS, publish ProDentim, or send paid traffic.

## Architecture (current)

| Item | Choice |
|---|---|
| Runtime | Node 20+, Next.js 15 App Router, React 19 |
| Process | Long-running `next start` (not serverless; `better-sqlite3` needs a persistent Node process and disk) |
| Database | SQLite file (`PRESELL_OS_DB`, default `data/presell-os.db`) on a persistent volume |
| Media | `MEDIA_STORAGE=LOCAL` on the same volume, or `OBJECT_STORAGE` (S3-compatible) |
| Admin | Password + HMAC session cookie (`aia_adm`) |
| Public origin | `PUBLIC_SITE_URL` (https required in production) |

Compatible hosts: a VPS, Fly.io/Railway/Render **with a persistent disk**, or any
single Node VM. Multi-instance/serverless is **not** supported while SQLite is
the database.

Rollback of a release is “redeploy the previous image/build”. SQLite
migrations in this phase are additive (`CREATE TABLE IF NOT EXISTS` /
`ALTER` guarded by `PRAGMA`). There is no automatic destructive schema
rollback.

## Environment classes

- **PUBLIC:** `PUBLIC_SITE_URL` / `APP_BASE_URL`, `PUBLIC_SITE_NAME`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_HEALTH_DISCLAIMER`
- **SERVER_ONLY:** `AIA_ENV`, `PRESELL_OS_DB`, `PRESELL_OS_MEDIA`, `MEDIA_STORAGE`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `VISUAL_QA_BASE_URL`
- **SECRET:** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `INTERNAL_FRAME_SECRET`, `CLICKBANK_INS_SECRET`, `ANTHROPIC_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

Never prefix secrets with `NEXT_PUBLIC_`.

## Commands

```
npm install
npx tsc --noEmit
npx tsx scripts/run-all-tests.mjs
npx tsx scripts/backup-presell-os.ts
npx next build
npx next start
curl -sS https://YOUR_DOMAIN/api/health
```

`next build` does not require production secrets. Production protections and
fatal env validation run only when `AIA_ENV=production`. `NODE_ENV=production`
alone does not set that mode.

`next build` **does** need the production `PUBLIC_SITE_URL`, `PUBLIC_SITE_NAME`
and `PUBLIC_CONTACT_EMAIL`: the legal pages (`/about`, `/contact`, `/privacy`,
`/terms`, `/affiliate-disclosure`) are prerendered and bake their canonical URL
and contact text at build time. `/p/[slug]`, `/sitemap.xml` and `/robots.txt`
are rendered per request.

Required when `AIA_ENV=production`: `AIA_ENV`, `PUBLIC_SITE_URL`,
`CLICKBANK_INS_SECRET`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`INTERNAL_FRAME_SECRET`. Optional: `PUBLIC_CONTACT_EMAIL`, `PUBLIC_SITE_NAME`.

## Deploy checklist

1. Provision a single Node 20+ host with persistent disk and HTTPS proxy.
2. Set `AIA_ENV=production` and every required SECRET/PUBLIC variable.
3. Mount the persistent volume at `<app>/data` and leave `PRESELL_OS_DB` / `PRESELL_OS_MEDIA` unset. `data/visual-design/` is always read relative to the app directory, so pointing the overrides elsewhere splits the state.
4. Restore a backup if this is not a greenfield disk.
5. `npx tsx scripts/predeploy-media-check.ts --campaign <id>` for every publication candidate; it exits 1 if any required media is missing.
6. `npx next build` then `npx next start` (or your process manager).
7. Gate traffic on `/api/health` returning 200 `{ "status": "ok" }`. With an incomplete production env the process stays up but answers 500 everywhere; a process-exit watchdog alone will not catch it.
8. Log in at `/admin/login`. Open `/admin/system/readiness`.
9. Create a **safe fixture** campaign (not ProDentim). Preview. Publish only if gates allow.
10. Confirm `/p/fixture` is 200, `/p/prodentim-page-builder-v2` is 404.
11. CTA click on the fixture (tracking). Do **not** register live ClickBank INS until the domain is approved.
12. `robots.txt` and `sitemap.xml` include only published URLs.
13. Keep a copy of `data/backups/`.

## DNS / TLS (manual)

- Pick one canonical host (www **or** apex, not both without a redirect).
- Issue TLS at the proxy. Application `PUBLIC_SITE_URL` must be `https://...`.
- This repo does not change DNS.

## Backup / restore

- **Method:** `npx tsx scripts/backup-presell-os.ts` writes `data/backups/<timestamp>/` with a single-file SQLite snapshot (`VACUUM INTO`, includes rows still in `-wal`, `integrity_check` recorded in `MANIFEST.json`), `product-images/` and `visual-design/`. Safe while the app runs. Never copy the live `presell-os.db` file by hand.
- **Frequency:** at least daily, and before every deploy/migration.
- **Retention:** keep 14 daily + 1 monthly for 6 months (operator policy). Store copies off the host.
- **Restore:** stop the app, run `npx tsx scripts/backup-presell-os.ts restore data/backups/<timestamp> --confirm-restore`, start, confirm `/api/health` and an admin campaign list. Restore verifies integrity, removes stale `-wal/-shm/-journal` at the destination and replaces the DB atomically; media directories are merged back.
- Covers campaigns, compositions, ProductFacts snapshots, DesignPlan, CreativeCompositionPlan, Visual QA JSON, tracking, ClickBank rows.

## Cache

Published HTML is `private, no-store` because PAGE_VIEW is recorded on render.
Product media uses content-hash names plus 1-day cache. Admin, tracking, INS,
and health are `no-store`. Publish/unpublish/edit do not need a CDN purge for
HTML. Asset replace creates a new `/media/product/<hash>.<ext>` URL.

## Tracking (privacy)

Stored: `aia_sid` (httpOnly UUID), clickId, utm_*, gclid, fbclid, msclkid,
referrer (clipped), campaign id, timestamps. No fingerprinting, no extra
identity enrichment. Recommend 24-month retention then delete raw visit/click
rows. Affiliate transactions follow bookkeeping needs.

Cookies: `aia_sid` and `aia_adm` are `HttpOnly; SameSite=Lax; Secure` on
HTTPS/production. Path `/`. Session 30 days; admin 12 hours.

## ClickBank INS

`POST /api/clickbank/ins` — HTTPS, AES envelope, idempotent unique key,
unknown `extclid` → `UNATTRIBUTED`. Do not rate-limit this route. Do not
point ClickBank at a temporary tunnel without operator approval.

## Rate limits (single process)

In-memory, per instance: admin login 8/min, AI generate 8/min, import 10/min.
ClickBank INS is not limited. Tracking failures never block navigation.

## Security headers

CSP `script-src 'self' 'unsafe-inline'` is required for published campaign
pixels (`headScript`) and Next.js. `img-src` allows `https:` for leftover
remote product URLs. `frame-ancestors 'none'` on admin/internal.

## Secret rotation

Set the new value in the host env, restart, then revoke the old value at the
provider. Never print current secrets. Rotate `ADMIN_SESSION_SECRET` logs
everyone out. Rotate `CLICKBANK_INS_SECRET` in ClickBank **and** the app in
the same window.

## Incidents

| Event | Action |
|---|---|
| Site down | Check process + `/api/health`; restore previous build |
| Database missing | Restore latest SQLite backup onto the volume |
| Storage missing | Restore `product-images/` or S3 objects |
| INS failing | Check logs category `CLICKBANK_INS` (no secrets); 503 means secret missing |
| Tracking failing | CTA still navigates; inspect `/api/track/cta` |
| Bad deploy | Redeploy previous build; restore DB only if a migration wrote bad data |
| Accidental publish | Unpublish immediately; confirm `/p/slug` is 404 (HTML is no-store) |
| Secret exposure | Rotate, restart, review logs; do not commit `.env` |

## Operator actions this phase cannot do

- Buy a domain / change DNS / issue production certificates
- Create the production VM/volume
- Register the live ClickBank INS URL
- Publish ProDentim (`prodentim-page-builder-v2` stays DRAFT / CONTENT_GATE=BLOCKED)
- Send paid traffic
