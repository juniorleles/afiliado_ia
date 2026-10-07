# SearchApi.io technical validation

Date: 2026-10-06

Scope: read-only investigation of the free SearchApi.io account against `engine=google`. No architecture files were changed. No adapter was added. Market Discovery was not called.

The key was read from `SEARCHAPI_API_KEY` in `.env.local` and sent only as `Authorization: Bearer`. It is not stored in this document or in the saved responses.

Saved responses: `docs/searchapi-samples/`. The connectivity response is the complete body plus response headers in `01-connectivity-joint-pain-supplement.json`.

## Budget

| Measure | Value |
| --- | --- |
| Credits before | 100 |
| Credits after | 93 |
| Credits consumed | 7 |
| Search HTTP calls | 10 |
| Account HTTP calls (`GET /api/v1/me`) | 2 |
| Successful searches (HTTP 200) | 7 |
| Rejected searches (HTTP 400) | 3 |

Limit was 20 requests and 20 credits. Account lookups and HTTP 400 responses did not move `remaining_credits`. `current_month_usage` stayed 0. On this free account `monthly_allowance` is 0 and the trial balance lives in `remaining_credits`.

`searches_this_hour` went from 0 to 7. `hourly_rate_limit` was 200000. No subscription period was returned.

## What was requested

Endpoint: `GET https://www.searchapi.io/api/v1/search`

Common parameters: `engine=google`. Keyword tests also sent `device=desktop`, `gl=us`, `hl=en`.

| Id | Role | Query | Extra parameters | HTTP | Client ms | Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Connectivity and first keyword | joint pain supplement | desktop, gl=us, hl=en | 200 | 3335 | 57045 |
| 02 | Keyword | blood sugar support | desktop, gl=us, hl=en | 200 | 2982 | 205012 |
| 02 | Keyword | hearing support | desktop, gl=us, hl=en | 200 | 2466 | 77651 |
| 02 | Keyword | weight loss | desktop, gl=us, hl=en | 200 | 5029 | 105075 |
| 02 | Keyword | sleep aid | desktop, gl=us, hl=en | 200 | 10014 | 70093 |
| 06 | Brazil Portuguese | joint pain supplement | desktop, gl=br, hl=pt | 200 | 1702 | 25162 |
| 07 | Mobile | joint pain supplement | mobile, gl=us, hl=en | 200 | 7757 | 78956 |
| 08 | Empty keyword | empty `q` | desktop, gl=us, hl=en | 400 | 151 | 63 |
| 08 | Invalid parameter | probe | device=not-a-device | 400 | 242 | 70 |
| 08 | Invalid country | probe | gl=zz | 400 | 429 | 56 |

The US English half of the locale comparison is request 01. That kept the locale phase to the two searches that were asked for, without a second US credit. The desktop half of the device comparison is the same request.

Not called, on purpose: `optimization_strategy=ads`, `link=resolved`, `location`, `page=2`, `device=tablet`, the AI Overview follow-up, and `html_url`.

## Phase 1 — connectivity

Authentication succeeded. HTTP 200. `search_metadata.status` was `Success`.

Client latency 3335 ms. Server `search_metadata.total_time_taken` was 3.05 seconds (`request_time_taken` 2.95, `parsing_time_taken` 0.1). Response header `x-runtime` was 3.083979. `x-request-id` was present.

Quota headers were absent. The response had no `X-RateLimit-*`, `RateLimit-*`, `Retry-After`, or credits header. Credits are visible only from `GET /api/v1/me`.

Other response headers on the success call: `content-type: application/json; charset=utf-8`, `content-encoding: br`, `cache-control: max-age=0, private, must-revalidate`, `etag`, `via` CloudFront, `x-cache: Miss from cloudfront`, `x-amz-cf-pop: GRU1-P5`, CORS `access-control-allow-origin: *`, HSTS, `referrer-policy`, `x-frame-options: SAMEORIGIN`.

Account before the first search:

```json
{
  "account": { "current_month_usage": 0, "monthly_allowance": 0, "remaining_credits": 100 },
  "api_usage": { "searches_this_hour": 0, "hourly_rate_limit": 200000 }
}
```

## API capabilities observed

One Google web search returns structured JSON. The body does not contain the SERP HTML. `search_metadata` points at a stored HTML URL and a stored JSON URL. Those URLs were not fetched.

Documented parameters that matter here: `q`, `engine`, `device` (`desktop`, `mobile`, `tablet`), `gl`, `hl`, `location` / `uule` / coordinates, `page`, `optimization_strategy` (`performance` default, or `ads`), `link` (`raw` default, or `resolved`). `num` is documented as phased out and fixed at 10. `google_domain` is documented as deprecated.

Documented billing: one credit per HTTP 200 search. Failed requests are not charged. This run matched that rule.

Engines other than `google` were not called.

## JSON schema observed

Every HTTP 200 body had these objects:

| Field | Observed shape |
| --- | --- |
| `search_metadata` | `id`, `status`, `created_at`, `request_time_taken`, `parsing_time_taken`, `total_time_taken`, `request_url`, `html_url`, `json_url` |
| `search_parameters` | Echo of `engine`, `q`, `device`, `hl`, `gl`. `hl=pt` was stored as `pt-br`. |
| `search_information` | `query_displayed`, `detected_location`, `has_no_results_for`. `total_results` was absent. |
| `ai_overview` | Either `text_blocks`, `markdown`, `reference_links`, or `error` plus `page_token`. |
| `organic_results` | Array, 7 to 9 items. |
| `pagination` | `current: 1` and `next` (a Google URL with `start=10`). |

Blocks that appeared only on some queries:

| Block | Where it appeared | Count |
| --- | --- | --- |
| `ads` | joint pain desktop US (5), weight loss (4), joint pain Brazil (1) | text ads |
| `shopping_ads` | blood sugar support (30), weight loss (3) | product ads |
| `local_map` | hearing support, weight loss | object with `link`, `image` |
| `local_results` | hearing support (3), weight loss (3) | places |
| `inline_images` | sleep aid, mobile joint pain | `{ images: [...] }` |
| `inline_shopping` | mobile joint pain (15) | products |
| `top_stories` | weight loss (2) | news-like cards |
| `discussions_and_forums` | sleep aid (2) | forum cards |
| `related_questions` | every response except none were absent | 4 or 9 |
| `related_searches` | every desktop response (8). Absent on mobile. | queries |

Absent in all seven successes: `knowledge_graph`, `news_results`, `inline_videos`, `answer_box`, and any `html` field.

`related_questions` in this sample were AI Overview placeholders: `is_ai_overview`, `question`, `error`, `page_token`, `next_page_token`. The documented answered form (`answer`, `source`) was not present. Hearing support and the Brazil search also returned `ai_overview.error` = `An AI Overview is not available for this search` plus a `page_token`. Fetching that token is a separate Google AI Overview call and was not made.

`related_searches[]`: `query`, `link`.

`top_stories[]`: `title`, `link`, `source`, `date`, `iso_date`, `thumbnail`.

`discussions_and_forums[]`: `title`, `link`, `source`, `date`, `favicon`, `answers`.

`inline_images.images[]`: `title`, `thumbnail`.

`local_results[]`: `position`, `title`, `link`, `place_id`, `data_id`, `ludocid`, `kgmid`, `rating`, `reviews`, `type`, `address`, `gps_coordinates`, `phone`, `extensions`, `image`. Extensions observed as strings such as hours (`Closed`, `Opens 8 AM`).

`inline_shopping[]`: `position`, `product_id`, `title`, `link`, `rating`, `reviews`, `price`, `extracted_price`, `original_price`, `extracted_original_price`, `thumbnail`, `product_token`.

## Ads schema

Text ads live in `ads`. Product ads live in `shopping_ads`. They are different objects. Organic results are not repeated inside `ads`.

### Text ad (`ads[]`)

Observed keys: `position`, `block_position`, `title`, `link`, `source`, `domain`, `displayed_link`, `tracking_link`, `snippet`, `favicon`, `advertiser_info_token`, optional `sitelinks`, optional `thumbnail`.

| Asked field | Observed |
| --- | --- |
| Title | `title` |
| Description | `snippet`. There is no `description` key. |
| Displayed URL | `displayed_link` |
| Destination URL | `link`. Sometimes a clean origin (`https://www.dasuquin.com/`). Sometimes a long landing URL that already contains `gclid`. |
| Domain | `domain` (`www.dasuquin.com`). `source` is a label and is sometimes the brand (`Relief Factor`, `TrimRX`) and sometimes the registrable name. |
| Position | `position` starting at 1, plus `block_position` of `top` or `bottom`. |
| Advertiser | No `advertiser` key. `source` is the visible label. |
| Extensions | `sitelinks.expanded[]` and `sitelinks.inline[]` with `title`, `link`, `tracking_link`. |
| Rating | Absent on text ads in this sample. |
| Price | Absent on text ads in this sample. |
| Callouts | No callout key. The closest text is `snippet`. |
| Tracking URL | `tracking_link`, host `www.google.com`, path `/aclk`. Some end at `&adurl` with an empty destination while `link` holds the page. |
| IDs | `advertiser_info_token` (opaque string). `gclid` appears inside `link` and `tracking_link`. No creative id. The search id is `search_metadata.id`. |

Joint pain, desktop, US: 5 ads. Three `top` (dasuquin.com, relieffactor.com, cosamin.com) and two `bottom` (dasuquin.com, relieffactor.com again). Weight loss, desktop, US: 4 ads, all `top` (trimrx.com, ro.co, forhers.com, and a fourth). Brazil, same English keyword: 1 `bottom` ad, source `amitamin`, title in German.

### Shopping ad (`shopping_ads[]`)

Observed keys: `position`, `block_position`, `title`, `seller`, `link`, `product_link`, `price`, `extracted_price`, optional `original_price`, `extracted_original_price`, `delivery`, `deal`, `extensions`, `rating`, `reviews`, `seller_rating`, `image`.

Blood sugar support returned 30 shopping ads and zero text ads. An extensions value observed was the string `Discount code`. A rated example: title beginning `Dr. Berg Blood Sugar Support`, rating 4.2, 677 reviews, price `CA$62`, seller `Dr. Berg's Store`. Another seller was `Amazon CA` at `CA$35.99`. `gl=us` was echoed and `detected_location` was `Unknown`. Shopping currency was Canadian on that query. `location` was not sent.

Weight loss returned both 4 text ads and 3 shopping ads.

## Organic schema

`organic_results[]` keys seen across the seven responses:

`position`, `title`, `link`, `source`, `domain`, `displayed_link`, `snippet`, `snippet_highlighted_words`, `favicon`, optional `date`, optional `sitelinks`, optional `images`, optional `thumbnail`.

| Asked field | Observed |
| --- | --- |
| Title | `title` |
| Snippet | `snippet` |
| Domain | `domain`, with `source` as the site label |
| Breadcrumb | Inside `displayed_link`, using the Google separator. No separate breadcrumb field. |
| URL | `link` (resolved destination on the items inspected) |
| Position | `position` starting at 1, in the array order returned |
| Date | `date` on some rows only (`Nov 6, 2025`, `16 de jan. de 2025`). `top_stories` also has `iso_date`. Organic rows did not. |
| Rich snippets | No `rich_snippet` object. Highlighted words and sitelinks showed up. Hearing support had one organic sitelink. Mobile had one organic `images` array. |
| Structured data | No JSON-LD or structured-data field. |

Organic count per page was 7, 8, or 9, under the documented page size of 10.

## Localization

Same keyword, `joint pain supplement`.

| | US English (request 01) | Brazil Portuguese (request 06) |
| --- | --- | --- |
| Parameters echoed | `gl=us`, `hl=en`, `device=desktop` | `gl=br`, `hl=pt-br`, `device=desktop` |
| `detected_location` | `Unknown` | `Desconhecido` |
| Text ads | 5 (US supplement brands) | 1 (amitamin, German title, `block_position=bottom`) |
| Shopping ads | none | none |
| Organic | 9, led by arthritis.org, aarp.org, henryford.com | 9, different set: youtube.com, boots.com, amazon.com, myprotein.com, vitabiotics.com, iherb.com |
| Related searches | 8 | 8 |
| Organic dates | English (`Nov 6, 2025`) | Portuguese month form on at least one row (`16 de jan. de 2025`) |

`hl=pt` was accepted and normalized to `pt-br`. The English keyword was not translated. Brazil results were mostly English-language retailers, and the only ad was German. `gl` and `hl` changed the SERP. They did not produce a Portuguese query.

## Device

Same keyword, US English.

| | Desktop (request 01) | Mobile (request 07) |
| --- | --- | --- |
| Text ads | 5 | absent |
| Shopping | absent | `inline_shopping` 15, prices in USD (`$16.12`) |
| Images | absent | `inline_images` |
| Organic | 9, publishers and brand sites first | 8, Amazon, Reddit, Facebook, Walmart first |
| Related searches | 8 | absent |
| Related questions | 4 | 4 |
| AI Overview | text blocks and 9 references | text blocks and 9 references |
| Pagination | `current` 1, `next` present | same shape |

The JSON shape changes with `device`. A desktop `ads` array is not a reliable picture of the mobile page. Mobile product units arrived as `inline_shopping`, not `shopping_ads`.

## Errors

The API key was not invalidated.

| Case | Body | HTTP |
| --- | --- | --- |
| Empty keyword | `{"error":"Missing required parameter: either q or kgmid."}` | 400 |
| Invalid parameter `device=not-a-device` | `{"error":"Unsupported value `not-a-device` in device parameter."}` | 400 |
| Invalid country `gl=zz` | `{"error":"Unsupported value `zz` in gl parameter."}` | 400 |

Error headers used `cache-control: no-cache` and `x-cache: Error from cloudfront`. `x-runtime` was under 0.06 seconds. No credit was consumed.

## Performance

Successful searches only:

| Measure | Value |
| --- | --- |
| Average client response time | 4755 ms |
| Fastest | 1702 ms (Brazil) |
| Slowest | 10014 ms (sleep aid) |
| Average payload | 88428 bytes (about 86 KB) |
| Smallest payload | 25162 bytes (Brazil) |
| Largest payload | 205012 bytes (blood sugar support; shopping images are inline) |
| Credits consumed | 7 |
| Credits remaining | 93 |

Server timing on the connectivity call was 3.05 seconds, close to the client measurement. The sleep aid and mobile calls were several seconds slower. Image and thumbnail fields are data URIs and dominate payload size.

## Missing information

- SERP HTML is not in the JSON. It is only referenced by `html_url`.
- Landing-page HTML, final URL after redirects, HTTP status, and response headers are absent.
- Knowledge graph, news results, inline videos, and answer box were absent for these commercial queries. The API can return them for other queries. This sample did not see them.
- Text ads had no rating, price, callout array, or advertiser legal name.
- Text ads were absent for hearing support, sleep aid, blood sugar support (shopping ads only), and the mobile joint-pain search, under the default strategy.
- `search_information.total_results` was absent. `detected_location` was unknown because `location` was not sent.
- People Also Ask answers were not inlined. The rows were tokens for another request.
- AI Overview was a token, not an answer, on hearing support and the Brazil search.
- No stable ad creative id.
- `page` 2 was not requested. `pagination.next` is a Google URL, not an API cursor.
- `optimization_strategy=ads` and `link=resolved` were not measured.

## Limitations

- Default collection missed text ads on 3 of 5 US desktop keywords and on the mobile sample. The documented `ads` strategy may change that. It was not spent.
- `gl=us` did not force USD shopping prices on blood sugar support (`CA$`, seller `Amazon CA`) when `location` was omitted.
- `hl=pt` is stored as `pt-br`. Callers that require the exact request language must keep their own copy.
- One credit buys one page of about 10 organic results. A second page is another credit.
- Stored HTML and AI Overview follow-ups are extra requests.
- Free-account `monthly_allowance` is 0. Trial credits are `remaining_credits` only.
- Quota is not on the search response. A separate account call is required.
- Pay-per-success was confirmed for these three 400s. Other failure modes were not provoked.

## Fields required by Market Discovery

The current hosts still expect their own records. This is the overlap with SearchApi.

| Market Discovery field | SearchApi source |
| --- | --- |
| Search snapshot `query` | `search_parameters.q` and `search_information.query_displayed` |
| `language`, `country`, `device` | `hl`, `gl`, `device`. Keep the requested `hl` as well as the echoed value. |
| `market` | Not returned. It stays a platform field. |
| `searchUrl` | `search_metadata.request_url` |
| `html` | Not in the body. |
| SERP `title`, `url`, `description`, `position` | Organic `title`, `link`, `snippet`, `position`. Ad `title`, `link`, `snippet`, `position`. |
| `resultType` | Assigned by the mapper from which array the row came from. |
| `sponsoredMarker` | Array membership plus `block_position`. There is no literal "Sponsored" string. |
| `organicMarker` | Array membership of `organic_results`. |
| Sponsored `title`, `url`, `description`, `position` | Same ad fields. `tracking_link` belongs in metadata, not in `url`, when `link` is already a destination. |
| Landing page destination, final URL, status, headers, html | Not returned. |
| Product identity (`productName`, brand, vendor, offer URL, visible price, currency) | Not returned from the landing page. A shopping `title`, `price`, or `seller` is SERP text, not a landing-page identity. |
| Report coverage, warnings, graph | Still computed by the report from the records above. |

## Fields required by Product Intelligence

Product Intelligence reads landing-page evidence and ClickBank marketplace facts. SearchApi's Google engine does not supply them.

| Product Intelligence need | SearchApi |
| --- | --- |
| Visible product name, brand, vendor, offer URL, category, language | Absent. SERP titles are not that identity. |
| Visible price and currency on the landing page | Absent. Shopping `price` / `extracted_price` are a different source and must stay labeled as SERP shopping text. |
| HTML title, meta title, Open Graph, H1, canonical, JSON-LD | Absent. |
| ClickBank gravity, commission, affiliate resources | Absent. |
| Commercial and competition signals that rest on landing pages | Still need the page collector. |
| SERP-level competitor domains, ad copy, positions | Present, and useful as upstream evidence once a mapper copies them. |

## Cost

Published SearchApi.io prices checked for this report (vendor pricing page):

| Plan | Monthly price | Included successful searches | Per 1,000 |
| --- | --- | --- | --- |
| Developer | $40 | 10,000 | $4 |
| Production | $100 | 35,000 | $3 |
| BigData | $250 | 100,000 | $2.50 |
| Scale | $500 | 250,000 | $2 |
| Octo 500K | $900 | 500,000 | $1.80 |
| Octo 1M | $1,500 | 1,000,000 | $1.50 |
| Octo 2M | $2,800 | 2,000,000 | $1.40 |
| Octo 5M | $5,000 | 5,000,000 | $1 |

Request cost observed here: 1 credit per HTTP 200. HTTP 400 cost 0. `GET /api/v1/me` cost 0.

There is no ongoing free plan. This account has a 100-credit signup trial. 93 remain.

Illustrative monthly volume at the Developer unit rate, one credit per search, landing pages not included:

| Pattern | Searches / month | Credits | Fits |
| --- | --- | --- | --- |
| 20 keywords, desktop US, daily | 600 | 600 | Developer ($40 includes 10,000) |
| 20 keywords, desktop and mobile, daily | 1,200 | 1,200 | Developer |
| 50 keywords, desktop US and Brazil, daily | 3,000 | 3,000 | Developer |
| 200 keywords, two devices, two locales, daily | 24,000 | 24,000 | Production ($100 includes 35,000) |

A second results page, an AI Overview fetch, or `link=resolved` would multiply credits. Landing-page retrieval is outside this price.

## Architecture recommendation

SearchApi can be the live Google SERP provider. It should sit behind the search-provider contract that already exists (`SearchRequest`, `SearchResponse`, `SearchSnapshot`, registry, factory). Market Discovery keeps its stage order and its record contracts.

The Google Search Connector cannot be swapped in place. Its snapshot is raw HTML, and this API does not return that HTML. A SearchApi provider returns structured JSON. A later mapper can build SERP records and sponsored records from `organic_results`, `ads`, and `shopping_ads`. The HTML parser and the sponsored detector stay for supplied-HTML snapshots and replays.

The landing-page collector, product identifier, ClickBank resolver, affiliate resolver, and market report stay. SearchApi stops at the SERP.

Do not synthesize fake SERP HTML so the current connector can "accept" SearchApi. That would hide the source.

## Provider recommendation

SearchApi.io is the recommended Google SERP provider for a later adapter.

Reasons from this run: Bearer auth works, errors are explicit and unbilled, `gl` / `hl` / `device` are echoed, text ads expose title, snippet, displayed link, destination, domain, position, block, sitelinks, and a Google tracking URL, and organic rows expose title, snippet, domain, link, and position.

Conditions before production traffic: keep the provider registry, map both `ads` and `shopping_ads`, treat mobile `inline_shopping` as its own block, send `location` when currency and country must agree, and measure `optimization_strategy=ads` on a separate budget because the default strategy missed text ads on several keywords in this sample.

## Estimated implementation complexity

Small for a provider module that calls SearchApi and freezes the JSON into the existing search-provider response. Medium for the mapper onto SERP and sponsored records, because text ads, shopping ads, and mobile inline shopping are three shapes. Separate, and larger, for any change to the Market Discovery pipeline: the pipeline still requires an HTML search snapshot, then the parser, then the detector. That pipeline should stay unchanged until a phase explicitly accepts structured SERP input.

No production adapter was written in this investigation.

## Recommended provider architecture

1. Registry holds Mock for offline runs and, later, a SearchApi provider under the same `search()` contract.
2. The SearchApi provider performs one Google search and stores the JSON. It does not parse HTML and it does not fetch landing pages.
3. A normalizer, still outside the frozen pipeline until a later phase, copies `organic_results` into SERP records and copies `ads`, `shopping_ads`, and mobile `inline_shopping` into sponsored records. `tracking_link`, `block_position`, price, and seller stay in metadata.
4. The landing-page collector still receives destination URLs and still stores status, headers, and HTML from a page source.
5. The product identifier still reads landing-page markers. Shopping prices stay on the SERP record.
6. The market report still aggregates those records and does not call SearchApi.

## Final answers

1. SearchApi is sufficient for the SERP half of an MVP: organic results, text ads, shopping ads, locale, and device. It is not sufficient for landing pages or product identity.
2. It can become the official Google SERP provider behind the existing registry. The registry stays, so the platform still does not depend on one provider.
3. Google HTML collection can be skipped on a SearchApi path. Landing-page HTML cannot.
4. SERP HTML parsing can be skipped on a SearchApi path. The parser stays for supplied HTML.
5. The sponsored detector can be skipped on a SearchApi path because ads arrive in their own arrays. The detector stays for supplied HTML.
6. The landing-page collector stays. SearchApi adds destination and tracking URLs and does not return the page.
7. No current module is unnecessary. The HTML parser and the sponsored detector become optional only on a future SearchApi path.
8. Leave these as they are: Market Discovery pipeline and every current host, Product Intelligence, the platform kernel, Discovery, Opportunity, Traffic, Decision, Workflow, Execution, the Google Ads provider, and the search-provider contract.
9. SearchApi is recommended for production SERP retrieval after that adapter exists, with a monthly credit budget. It is not recommended as a replacement for landing-page or product evidence. Ad coverage under the default strategy was incomplete in this sample.
10. Keep the same responsibilities. The provider fetches one SERP and returns frozen JSON. A normalizer maps arrays onto the current SERP and sponsored records. The collector still stores landing pages. The identifier still reads those pages. The report still only aggregates. SearchApi never becomes a hidden call inside the parser, the detector, or the report.

Credits before testing: 100

Credits after testing: 93

Credits consumed: 7
