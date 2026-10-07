# Final Platform Validation

## Platform Version

Validation label: AI Affiliate Platform v3.0.0

Repository package: `afiliado_ia` 0.1.0

## Execution Date

2026-10-06, local time (UTC-3)

Pipeline start: 2026-10-07T00:58:34.291Z

Report closed: 2026-10-06T22:20:42-03:00

## Execution Duration

Live pipeline (search through opportunity drafts): 6.661 seconds

Search request: 2.578 seconds, 1 SearchApi request

Landing page collection: 3.962 seconds

Production build: 220.3 seconds (compiled in 97 seconds, then typecheck and static generation)

TypeScript check after the compiler flag fix: exit 0

Regression replay: 336.7 seconds, `REGRESSION_FAILURES=0`

## Infrastructure Status

FAIL for production readiness. The application host, dependencies, database files, SearchApi key, TypeScript check, and production build are in place. Google Ads credentials are absent.

| Check | Result |
| --- | --- |
| Node | v20.20.2 |
| Dependencies | `node_modules` present, `package-lock.json` present |
| Next.js | 15.5.26 |
| TypeScript | 5.9.3, `tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 |
| Database `presell-os.db` | 1282048 bytes, 2026-09-25T18:04:01.761Z |
| Database `presell-os.db-shm` | 32768 bytes, 2026-09-29T20:33:37.452Z |
| Database `presell-os.db-wal` | 3328992 bytes, 2026-10-01T13:54:24.120Z |
| `SEARCHAPI_API_KEY` | SET |
| `DEMO_PUBLISH` | MISSING |
| `GOOGLE_ADS_CLIENT_ID` | MISSING |
| `GOOGLE_ADS_CLIENT_SECRET` | MISSING |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | MISSING |
| `GOOGLE_ADS_REFRESH_TOKEN` | MISSING |
| `GOOGLE_ADS_CUSTOMER_ID` | MISSING |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | MISSING |
| `GOOGLE_ADS_TEST_CUSTOMER_ID` | MISSING |

The production build compiled while a development server already owned `.next`, so that build wrote a temporary output directory. The directory was removed after exit 0. Database sizes and timestamps stayed at the baselines above.

One compiler setting was required before the build typecheck could finish: `allowImportingTsExtensions` is now true in `tsconfig.json`. The metrics collector already imports `google-auth-client.ts` with a `.ts` suffix, and the metrics test requires that specifier. No domain model or business rule was changed.

## Search Status

PASS

Keyword `joint pain supplement`, country US, language en, device desktop.

| Check | Result |
| --- | --- |
| SearchApi provider | OK, no issues, snapshot frozen |
| Normalizer | OK, no issues, snapshot frozen |
| SERP records | 45 |
| Organic results | 8 |
| Sponsored results | 37 |
| HTTPS sponsored URLs selected for collection | 3 |
| Execution time | 2.578 seconds |
| Requests | 1 |

## Landing Pages Status

PASS

Maximum of 3 pages collected. Each response was HTTP 200, HTML, and frozen.

| Page | HTTP | Redirects | Final URL | HTML bytes |
| --- | --- | --- | --- | --- |
| landing-session-1-page-1 | 200 | 1 | `https://www.omegaxl.com/tv-offer-omegaxl` | 560136 |
| landing-session-1-page-2 | 200 | 2 | `https://www.qunol.com/collections/turmeric` | 338240 |
| landing-session-1-page-3 | 200 | 2 | `https://stonehengehealth.com/products/dynamic-joint` | 1312814 |

The collector stored the full final URL, including the query string returned by each redirect chain.

## Observed Products

PASS

3 observed products. Evidence graph: 40 nodes. Snapshot frozen.

| Product | Brand | Price |
| --- | --- | --- |
| TV Offer - OmegaXL | not observed | 49.95 |
| Turmeric Curcumin Supplements | not observed | not observed |
| Dynamic Joint | Stonehenge Health | 49.95 |

## Market Intelligence

PASS

Market report status OK, no issues, snapshot frozen.

| Record | Count |
| --- | --- |
| Observed brands | 1 |
| Observed categories | 0 |
| Observed prices | 1 |

The collected pages did not yield a category record.

## Opportunity Ranking

PASS

Scoring, ranking, and portfolio each returned OK with no issues.

Ordered ranking: position 1, `joint-pain-supplement`.

Policy: balanced. Portfolio grouping used the observed language `en` and country `US`.

## Recommendations

PASS for the opportunity recommendation. The engine returned OK with no issues.

Kind: `MONITOR`.

## Google Ads Status

Draft PASS. No Google Ads request was sent.

`DEMO_PUBLISH` is not true, so the run validated local paused drafts and did not publish.

| Draft | Issues |
| --- | --- |
| Paused campaign draft | 0 |
| Paused ad group draft | 0 |
| Paused RSA draft | 0 |

OAuth, the developer token, and customer access were not exercised because those credentials are missing.

## Optimization Status

FAIL

Metrics were not collected. There is no authenticated Google Ads account and no paused campaign resource to read. Performance analysis, optimization recommendations, and pending actions for a live campaign were therefore not produced in this run.

The offline Optimization Engine replay inside the regression suite passed, including the metrics collector, performance analyzer, recommendation engine, and pause/resume rules, using a scripted account service.

## Regression Status

PASS

Replay covered Platform Kernel, Discovery, Opportunity, Traffic, Decision, Workflow, Execution Planner, Product Intelligence, Market Discovery, Search Intelligence, Opportunity Engine, Google Ads Live, and Optimization Engine.

`REGRESSION_FAILURES=0`

Database files kept their baseline sizes and timestamps. No mutation of the presell database was observed.

## Known Limitations

- The repository package version is 0.1.0. This run is the v3.0.0 validation label.
- Google Ads client id, client secret, refresh token, developer token, customer id, login customer id, and test customer id are not configured.
- Live publish stayed off because `DEMO_PUBLISH` is not true.
- Observed categories are empty for this search. Two products have no observed brand. One product has no observed price.
- The production build used a temporary output directory because the development server already held `.next`.
- `allowImportingTsExtensions` was enabled so the existing `.ts` import specifiers typecheck under `tsc` and `next build`.

## Performance Summary

| Stage | Time |
| --- | --- |
| SearchApi search | 2.578 seconds |
| Landing page collection, 3 pages | 3.962 seconds |
| Full live pipeline | 6.661 seconds |
| Production compile | 97 seconds |
| Production build, end to end | 220.3 seconds |
| Regression replay | 336.7 seconds |

## Final Decision

NOT READY

Blocking issues:

1. Google Ads credentials are missing: client id, client secret, developer token, refresh token, customer id, login customer id, and test customer id.
2. No paused campaign was published, so there is no live Google Ads resource to synchronize.
3. Optimization metrics were not collected from a live account, so the live optimization path did not execute.
