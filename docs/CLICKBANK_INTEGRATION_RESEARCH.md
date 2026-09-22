# ClickBank integration research (Phase 5)

Researched against **current official ClickBank Help Center articles**
(support.clickbank.com) before any application code was written. No
undocumented hop parameters, webhook shapes, or auth schemes are used.

## Official mechanism

| Concern | Official mechanism |
|---|---|
| Pass affiliate tracking on outbound hops | HopLink / Direct Tracking Link query parameters |
| Unique partner/external click identifier | `extclid` |
| Legacy hop tracking code | `tid` (still accepted; **not** used here) |
| Receive sale/refund notifications | Instant Notification Service (INS) |
| Authenticity | AES-256-CBC encryption of the INS JSON with the account secret key + IV |
| Affiliate commission (affiliate role) | `totalAccountAmount` — “Total you received for the transaction in USD” |
| Transaction identifier | `receipt` |
| Refunds | `transactionType=RFND` (separate notification; original SALE is not replaced) |
| Chargebacks | `CGBK` (card) and `INSF` (eCheck) |
| Recurring / rebill | `BILL`; cancel/uncancel via `CANCEL-REBILL` / `UNCANCEL-REBILL` |

INS Version **8** is required to receive `affiliateTrackingParameters`
(including `extclid`) back on the notification. Versions 6–7 encrypt the
payload but do not document the new affiliate tracking parameter echo.

## Official parameter names (hop)

From *Affiliate Tracking Parameters* and *HopLinks Guide*:

| Parameter | Purpose | Constraints |
|---|---|---|
| `extclid` | Partner / external click identifier | 0–256 characters. Official examples include UUID-shaped values **with dashes**. |
| `tid` | Legacy tracking ID | Max 100; **lowercase letters, numbers, underscore only; dashes are invalid**. |
| `fbclid` | Facebook click id (ClickBank Facebook integration) | 0–256 |
| `campaign`, `offer`, `trafficType`, … | Non-unique campaign metadata | Various 0–100/150 limits |
| `uniqueAffSub1`–`uniqueAffSub5` | Unique affiliate sub-ids | 0–256 |

HopLink forms documented by ClickBank:

- `https://hop.clickbank.net/?affiliate=NICKNAME&vendor=NICKNAME&tid=…`
- Encrypted hop: `https://VENDOR.AFFILIATE.hop.clickbank.net/?tid=…`

This product maps Phase 4 `clickId` (UUID, includes dashes) → **`extclid` only**.
`tid` is not written: a UUID would violate the official TID character set.

UTM / `gclid` / `fbclid` / `msclkid` forwarding is unchanged and independent
of ClickBank’s hop parameters.

## Notification mechanism

**Instant Notification Service (INS)**

- ClickBank HTML FORM POSTs to an HTTPS (or HTTP) URL you register
  (ports 80 or 443).
- Outer envelope (JSON):

```
{"notification": "<ENCRYPTED_NOTIFICATION>", "iv": "<INITIALIZATION_VECTOR>"}
```

- Inner payload is JSON after decryption (Version 8 affiliate-role sample
  includes `receipt`, `transactionType`, `totalAccountAmount`,
  `trackingCodes`, `affiliateTrackingParameters`, `lineItems`, `customer`, …).
- Success: HTTP response in the **200** range **within 3 seconds**.
- Failure: ClickBank retries every four hours, up to five attempts, then
  drops the notification (no later replay from ClickBank).
- Two URLs can be configured (Instant Notification / Instant Notification 2).
- **Test URL** in the ClickBank UI sends `transactionType=TEST` and
  `receipt=********`. Official note: notifications for test *purchases*
  (`TEST_SALE`, etc.) are sent only to the **seller**, not the affiliate.

Pixel / JS postbacks exist as a separate product surface. INS remains the
server-to-server mechanism and is what this integration uses.

## Authentication / verification

- You create a **secret key** in the ClickBank account (up to 16 characters,
  numbers and **capital letters**).
- ClickBank encrypts the inner JSON with **CBC-AES-256** using that secret
  and a per-message IV.
- Official code samples derive the AES-256 key as
  `substr(sha1(secretKey), 0, 32)` — the **first 32 hex characters of SHA-1**,
  used as 32 ASCII key bytes — then decrypt `notification` with IV both
  Base64-decoded. Samples: Java (`AES/CBC/PKCS5Padding`), PHP
  (`AES-256-CBC`), Python, Ruby.
- A payload that does not decrypt with the configured secret is not a
  genuine ClickBank INS message (or was altered). There is no separate
  HMAC header in the documented v6+ protocol.
- Older INS versions (< 6) are unencrypted; ClickBank recommends against
  them. This product accepts only the encrypted envelope.

## Relevant transaction types (official `transactionType`)

| Type | Meaning | Handled as |
|---|---|---|
| `SALE` | Standard purchase or first recurring charge | Sale |
| `BILL` | Recurring rebill | Rebill (commission, not a new “sale” count) |
| `RFND` | Refund (recurring refunds also emit `CANCEL-REBILL`) | Refund (row kept; original SALE kept) |
| `CGBK` | Chargeback | Chargeback (commission impact like a refund) |
| `INSF` | eCheck chargeback | Chargeback |
| `CANCEL-REBILL` | Recurring cancellation | Stored; not a sale |
| `UNCANCEL-REBILL` | Cancellation reversed | Stored; not a sale |
| `SUBSCRIPTION-CHG` | Subscription SKU change | Stored; not a sale |
| `ABANDONED_ORDER` | Cart abandonment (if enabled) | Stored; not a sale |
| `CUSTOMER_AUTH_FAILURE` | Recurring auth failure | Stored; not a sale |
| `CUSTOMER_EMAIL_UPDATE` | Email change | Stored; not a sale |
| `CUSTOMER_UPDATE_CC_NOTIFICATION` | Payment method change | Stored; not a sale |
| `PURCHASE_DETAILS_EMAIL_RESPONSE` | Receipt email resent | Stored; not a sale |
| `TEST` | INS “Test URL” ping | Stored; excluded from sales metrics |
| `TEST_SALE` / `TEST_BILL` / `TEST_RFND` / `CANCEL-TEST-REBILL` / `UNCANCEL-TEST-REBILL` | Seller test orders | Stored; excluded from sales metrics |

Unknown `transactionType` values are **not** counted as sales.

## Money fields

- Introductory INS note: **all currency amounts in the notification are
  presented in USD**.
- `totalAccountAmount` (All roles): amount **you** received, 2 decimal
  places. For an affiliate this is affiliate commission in USD.
- `accountAmount` (line item, All roles): amount you received on that item.
- `affiliatePayout`: documented as **Vendor** recipient only — not used as
  the affiliate’s commission.
- `currency`: documented as **Vendor** (currency the customer paid). Not
  used to convert `totalAccountAmount`.
- This product stores `totalAccountAmount` as integer USD cents and labels
  it **Affiliate Commission**, not “revenue”.

## Attribution echo (INS v8)

`affiliateTrackingParameters` is documented as affiliate-role only.
Unused hop parameters are omitted. The Version 8 sample is an **object**
(not a list) that includes `"extclid": "123"`.

`trackingCodes` remains “any tracking codes passed into the order form”
(typically `tid`). This product does not set `tid`.

`commonTrackingParameters.clickId` is ClickBank’s **own** hop/order-form
id, **not** our Phase 4 `clickId`. It is not used for attribution.

## Limitations

- INS v8 must be selected in the ClickBank account or `extclid` will not
  come back → sale is stored as **UNATTRIBUTED**.
- Affiliates do not receive seller-only test purchase notifications.
- Buyer PII appears on vendor-role payloads (`customer.shipping` /
  `customer.billing`). This product **does not persist** those fields.
- ClickBank may drop a notification after five failed deliveries.
- `tid` cannot carry a dashed UUID; `extclid` is the official unique
  click-id field.
- No official sandbox API distinct from INS Test URL / `TEST_*` types.
- Amounts are USD as presented by ClickBank; no FX conversion is defined.

## Documentation references

1. Instant Notification Service (INS) —
   https://support.clickbank.com/en/articles/10535147-instant-notification-service-ins
2. HopLinks Guide —
   https://support.clickbank.com/en/articles/10535278-hoplinks-guide
3. Affiliate Tracking Parameters —
   https://support.clickbank.com/en/articles/10535262-affiliate-tracking-parameters
4. Postback / pixels (INS still the server notification path) —
   https://support.clickbank.com/en/articles/10535373-postback-pixels

Accessed 2026-09-17.
