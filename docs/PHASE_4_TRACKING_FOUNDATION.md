# Phase 4 — Tracking & conversion foundation

First-party measurement of the affiliate presell funnel:

**VISIT TO PRESELL → CTA CLICK → OUTBOUND AFFILIATE VISIT**

This phase does **not** infer a sale. Sales and revenue are not available
until transaction attribution is integrated.

Visits and sessions do not necessarily represent individual humans.

## Event model

| Event | When | Where |
|---|---|---|
| PAGE_VIEW (`presell_visits`) | Published `/p/[slug]` server render | SQLite |
| CTA click (`cta_clicks`) | Click on hero / middle / final `<a>` | SQLite via `POST /api/track/cta` |

Admin preview never writes either event. Draft URLs 404 and never record.
Automated HTTP tests send `x-aia-analytics: skip` so they do not pollute
the operator database.

A second PAGE_VIEW for the same `campaignId` + `sessionId` inside 2 seconds
is ignored (React/dev double-render protection). Later views in the same
session still increment PAGE_VIEW and still count as one UNIQUE_SESSION.

## Database schema

Incremental `CREATE TABLE IF NOT EXISTS` in `src/lib/db.ts` (the SQLite
file is not recreated).

`presell_visits`: id, campaignId, sessionId, visitedAt, utmSource,
utmMedium, utmCampaign, utmContent, utmTerm, gclid, fbclid, msclkid,
referrer.

`cta_clicks`: id, clickId (unique), campaignId, sessionId, clickedAt,
ctaPosition (`hero` \| `middle` \| `final`), same attribution columns.

Indexes: campaignId+timestamp, sessionId, clickId.

## Session behavior

Cookie `aia_sid` (HttpOnly, SameSite=Lax, Path=/, ~30 days) is set by
middleware **only** on `/p/*`. Value is `crypto.randomUUID()` — not derived
from IP, user-agent, or a fingerprint. The current request also receives
`x-aia-sid` so the first view can be stored before the browser stores the
cookie.

## CTA behavior

Still a real `<a href>` in the same tab, `rel="nofollow sponsored"`. UTM /
gclid / fbclid / msclkid continue to be copied onto the affiliate URL.
`sendBeacon` (fallback `fetch` + keepalive) records the click. Tracking
errors are swallowed; navigation is never `preventDefault`ed. There is no
interstitial and no automatic redirect. User-agent does not change the hop.

## Attribution fields

Whitelist only: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term`, `gclid`, `fbclid`, `msclkid`. Values clipped to 200 characters.
Other query keys are ignored. Referrer is stored on visits only, clipped.

Internal `clickId` (UUID) is stored per outbound click so a future
ClickBank postback could reference it. This project does **not** currently
document an official ClickBank hop parameter for that id, so it is **not**
appended to the affiliate URL.

## CTR definition

Primary CTR = **CTA sessions / unique presell sessions** in the selected
date range (Today UTC, last 7 days, last 30 days, all time).

A session that clicks hero+middle+final counts as one CTA session.
`ctaEvents` is the raw click count (optional breakdown by position).

## Privacy

`/privacy` describes the first-party cookie and event rows. It does not
claim GDPR/CCPA certification. No fingerprinting, no cross-site identifiers
invented here, no IP stored by this application.

## Failure behavior

Visit insert is try/catch around the public page render. The click API
always returns 204. Failures log `[analytics] …` without a public stack
trace. The presell and the affiliate hop still work.

## Known limitations

- Unique sessions are browsers with our cookie, not people.
- JS-disabled browsers navigate but do not record CTA clicks.
- Deleting a campaign leaves orphan event rows.
- No charts, Ads API, ClickBank API, or conversion optimization.
- Strict Mode / refresh still create extra PAGE_VIEWs outside the 2s window.
