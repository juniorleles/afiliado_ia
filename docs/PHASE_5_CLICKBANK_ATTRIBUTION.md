# Phase 5 — ClickBank sales attribution

Closes the measurement loop:

**Presell visit → CTA click → ClickBank hop → transaction →
affiliate commission → attribution to campaign/click when supported.**

Official mechanism research: `docs/CLICKBANK_INTEGRATION_RESEARCH.md`.

An unattributed sale is a real transaction whose originating Presell OS
click could not be established.

## Official ClickBank mechanism used

| Piece | Official name |
|---|---|
| Outbound tracking | HopLink / Direct Tracking Link query parameter **`extclid`** |
| Notifications | Instant Notification Service (**INS**) version **8** |
| Envelope | JSON `{ "notification": "<ciphertext>", "iv": "<base64 IV>" }` (also accepted as `application/x-www-form-urlencoded` fields with those names) |
| Authenticity | AES-256-CBC; key = first 32 hex chars of SHA-1(secret), as in ClickBank’s PHP/Java/Python/Ruby samples |
| Commission | `totalAccountAmount` (amount **you** received, presented in **USD**) |
| Transaction id | `receipt` |
| Types handled | Official INS `transactionType` list (see research doc) |

`tid` is **not** written. Official TID forbids dashes; Phase 4 `clickId` is
a UUID. ClickBank’s own `commonTrackingParameters.clickId` is **not** our
id and is not used for attribution.

`affiliatePayout` is vendor-role in the INS spec and is not used.

## Environment configuration

`.env.example`:

```
CLICKBANK_INS_SECRET=
```

Server-side only. Up to 16 characters (A–Z and 0–9) as created in the
ClickBank account. Never commit a real value.

Notification URL to register in ClickBank:

```
POST https://YOUR_PUBLIC_ORIGIN/api/clickbank/ins
```

Select **INS version 8** so `affiliateTrackingParameters.extclid` is echoed.

## Tracking mapping

```
cta_clicks.clickId  (UUID)
        ↓  attachClickBankExtclid() on hop.clickbank.net / *.hop.clickbank.net
HopLink ?extclid=<clickId>
        ↓  INS v8 affiliateTrackingParameters.extclid
affiliate_transactions.clickId + campaignId + sessionId
```

If `extclid` is missing, empty, not a UUID, or does not match a stored
CTA click → store the transaction as **UNATTRIBUTED**. Never invent a
campaign/session/click.

Existing UTM / `gclid` / `fbclid` / `msclkid` forwarding is unchanged.
Non-ClickBank affiliate URLs are not given `extclid`.

The CTA remains a real `<a>`, same-tab, `rel="nofollow sponsored"`. On
published pages each CTA is stamped at render with its own `clickId` and,
when the destination is a ClickBank hop, official `extclid`. The click
handler beacons that same id and rewrites `href` only as a fallback.
No `preventDefault`. Admin preview does not stamp `extclid`. If JS or INS
is down, the hop still works.

## Transaction ingestion

`POST /api/clickbank/ins`

1. Reject if `CLICKBANK_INS_SECRET` is unset (503).
2. Reject bodies larger than 64 KiB (413).
3. Parse the encrypted envelope (JSON or form fields).
4. Decrypt with the configured secret. Failure → 400 (not authentic).
5. Require `receipt` (8–21 chars), `transactionType`, `transactionTime`,
   and a valid 2-decimal `totalAccountAmount`.
6. Persist official types only. Unknown types → 400, not counted as sales.
7. Idempotent on `(provider, receipt, transactionType, occurredAt)`.
8. HTTP 200 `"OK"` within ClickBank’s 3-second window on success/duplicate.
9. No public stack traces; operator logs use `[clickbank] …`.
10. Buyer `customer.*` fields are read never persisted.

Client-side “I made a sale” reports are not accepted.

## Database schema

Incremental `CREATE TABLE IF NOT EXISTS affiliate_transactions` in
`src/lib/db.ts`. The SQLite file is not recreated.

| Column | Source |
|---|---|
| provider | `clickbank` |
| externalTransactionId | `receipt` |
| transactionType | `transactionType` |
| campaignId / sessionId / clickId | from `cta_clicks` when ATTRIBUTED |
| occurredAt | `transactionTime` (ISO) |
| currency | `USD` (ClickBank presents amounts in USD) |
| affiliateCommissionCents | `totalAccountAmount` × 100 as integer minor units |
| trackingValue | `affiliateTrackingParameters.extclid` |
| attributionStatus | `ATTRIBUTED` \| `UNATTRIBUTED` |
| createdAt | insert time |

No buyer PII columns. No raw provider dump.

## Transaction types

Counted in **Sales**: `SALE` only (attributed to the campaign).

**Refunds**: `RFND` (separate row; original `SALE` kept).

**Rebills**: `BILL` (commission included; not added to the sales count).

**Chargebacks**: `CGBK`, `INSF` (commission debit like a refund).

Also stored, not treated as sales: `CANCEL-REBILL`, `UNCANCEL-REBILL`,
`SUBSCRIPTION-CHG`, `ABANDONED_ORDER`, customer-update types, and `TEST` /
`TEST_*` (INS Test URL / seller tests). Test types are excluded from
sales and commission totals.

Unknown types are not converted into sales.

## Refund behavior

A refund is a second row. Gross affiliate commission uses `SALE`+`BILL`.
Refunded commission uses absolute `RFND`+`CGBK`+`INSF`. Net = gross −
refunded. Dashboard labels say **Affiliate Commission**, not revenue.

## Attribution states

- **ATTRIBUTED** — `extclid` matched `cta_clicks.clickId`.
- **UNATTRIBUTED** — tracking missing/unknown. The sale is still stored.

## Analytics definitions (`/admin/[id]/analytics`)

Funnel (Phase 4): visits, unique sessions, CTA clicks, presell CTR
(CTA sessions / unique presell sessions).

ClickBank (this campaign, selected range, ATTRIBUTED rows unless noted):

| Metric | Definition |
|---|---|
| Sales | Count of `SALE` |
| Refunds | Count of `RFND` |
| Gross affiliate commission | Sum of `SALE`+`BILL` cents |
| Refunded commission | Absolute sum of `RFND`+`CGBK`+`INSF` cents |
| Net affiliate commission | Gross − refunded |
| Attributed sales | Same as Sales for this campaign |
| Unattributed sales | Site-wide `SALE` rows with `UNATTRIBUTED` (not assigned to this campaign) |
| CTA → Sale | Attributed `SALE` count / CTA sessions in the same range |

ROI / ROAS / profit are not shown: Google Ads spend is not connected.

`/admin/transactions` lists date, campaign, type, receipt, commission,
currency, attribution status.

## Local testing

ClickBank has no separate sandbox API for affiliates. Official options:

1. ClickBank UI **Test URL** → `transactionType=TEST`, `receipt=********`.
2. Deterministic fixtures in `scripts/test-clickbank.ts` that encrypt the
   documented JSON with the same AES-256-CBC derivation.

Tests use a temp SQLite file (`PRESELL_OS_DB`) so they never write fake
sales into the operator database.

```
npx tsx scripts/test-clickbank.ts
```

## Production checklist (human operator)

Do **not** skip this. The app cannot configure your ClickBank account.

1. In ClickBank, create an INS **secret key** (≤16 chars, A–Z / 0–9).
2. Put it in `.env.local` as `CLICKBANK_INS_SECRET` (never commit it).
3. Deploy so `https://YOUR_DOMAIN/api/clickbank/ins` is reachable on 443.
4. In ClickBank Instant Notification: paste that URL, choose **version 8**,
   save the secret, click **Test URL**, confirm HTTP 200.
5. Confirm the test row appears on `/admin/transactions` as `TEST`
   (excluded from sales totals).
6. Confirm published CTAs to `hop.clickbank.net` / `*.hop.clickbank.net`
   gain `extclid` after click (browser network/HTML).
7. After a real (or vendor-permitted) sale, confirm ATTRIBUTED vs
   UNATTRIBUTED on `/admin/transactions` and campaign analytics.
8. If `extclid` never comes back, the account is probably not on INS v8.

## Limitations

- JS-disabled browsers still receive server-stamped `extclid` on ClickBank
  hops, but no `cta_clicks` row is recorded → UNATTRIBUTED if they buy.
- Beacon can lose the race with a very fast purchase; then UNATTRIBUTED.
- ClickBank drops notifications after five failed deliveries.
- Amounts are USD as ClickBank presents them; no FX conversion.
- Google Ads API / ROAS is out of scope.
- Affiliates do not receive seller-only `TEST_SALE` purchase notifications.
