# Google Ads RC1 production audit — v3.2.0

Date: 2026-10-08

Decision: GOOGLE ADS READY

The audit certified the integration that is already in the tree. No backend, API, database, or business-logic change was required. No live Google Ads call was made.

## Infrastructure Summary

Node is v20.20.2. `npx tsc --noEmit` passed. The local database is present and schema version 15 includes the OAuth, discovery, paused-publish, and operations tables. The dev server on port 3000 answered the integration page, the publishing wizard, the operations dashboard, the print report, and the executive CSV.

`next build` was not run. The development server already owns `.next`, so a second production build would collide with it. The routes under audit compiled in that running server.

The OAuth names are absent from this installation: `ADMIN_SESSION_SECRET`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REDIRECT_URI`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_ADS_CLOUD_PROJECT`. The application treats each one as not configured. No value was printed.

## OAuth Summary

`scripts/test-google-ads-oauth-foundation.ts` passed. The consent URL is the authorization-code flow with PKCE and the Google Ads scope. The client secret and the developer token are not on that URL. The state cookie seals and opens the verifier, and a tampered cookie is refused. An authorization code becomes an encrypted refresh token. Disconnect removes the refresh token and keeps the client credentials. Reconnect replaces the grant. A missing Ads scope does not store a token. A missing redirect URI blocks the consent screen.

This installation cannot open a live Google consent screen until those environment names are set. That refusal is the expected guard.

## Account Discovery Summary

`scripts/test-google-ads-account-discovery.ts` passed. A fake CustomerService returned a manager, a child, and a standard account. Currency, time zone, and access role were stored. No account is selected until the operator chooses one, unless the list contains exactly one. A read-only manager does not receive write. Child accounts are read with the manager id. No mutate URL was sent. Disconnect removes the discovered rows.

## Publishing Summary

`scripts/test-google-ads-safe-publisher.ts` passed. The builder emits a paused Search campaign, a paused ad group, a paused responsive search ad, broad, phrase, exact, and negative keywords, and paused sitelink, callout, and structured-snippet assets. Manual CPC and Maximize clicks are both represented. The content network stays off. Performance Max and Shopping are refused. An incomplete plan does not call mutate. A second publish of the same local campaign and customer is refused. The wizard for campaign 184 returns HTTP 200 and keeps Publicar pausada disabled.

## Synchronization Summary

`scripts/test-google-ads-live-operations.ts` passed. The existing campaign synchronizer stored the campaign, and the following read stored a keyword resource and an asset resource. Campaign id, ad group id, and ad id persistence was already covered by the safe publisher test. The operations pipeline does not mutate during synchronization.

## Metrics Summary

`scripts/test-metrics-collector.ts` passed. Impressions, clicks, CTR, average CPC, cost, conversions, conversion value, and search impression share are copied from the account response. CPA and ROAS on the dashboard use the existing `costPerConversion` and `returnOnAdSpend` functions. Date windows today, yesterday, last 7 days, last 30 days, and a custom pair are accepted; an omitted window stays last 30 days. The seven-day window was observed in the operations test.

Quality score, average position, and lost impression share are not fields of the metrics collector. They were not invented for this audit.

## Optimization Summary

`scripts/test-performance-analyzer.ts`, `scripts/test-optimization-recommendation-engine.ts`, `scripts/test-pause-resume-rules.ts`, and `scripts/test-optimization-engine-rc1-acceptance.ts` passed. The operations pipeline calls those hosts and leaves every action pending. A pending pause was refused. After an explicit approval, one paused mutate ran, the read-back stayed paused, and a second execution was refused. The snapshot text did not change. The audit row stores the operator, the reason, and the before and after records.

## Security Summary

The OAuth and discovery tests assert that the database file and the status payload do not contain credential plaintext. The operations dashboard and the Google Ads settings page render presence labels, not token values. Integration code does not log the client secret, the refresh token, or the access token. The console integration test also asserts that configuration has no secret material.

## Performance Summary

Measured against the running dev server: the operations dashboard returned in 1.7s, the print report in 1.4s, and the executive CSV in 0.7s. The integration page and the publishing wizard took 9.3s and 13.5s on this pass because those routes were compiling. That is first-hit compilation, not a stuck request. No suite in this audit hung.

## Regression Summary

Passed in this audit:

- Google Ads OAuth, account discovery, safe publisher, and live operations
- Metrics collector, performance analyzer, recommendation engine, pause/resume rules, and the optimization RC1 acceptance suite
- Google Ads live RC1 acceptance and live authentication
- Offline campaign builder
- Opportunity engine RC1 acceptance
- Product intelligence RC1 acceptance and landing-page intelligence
- SearchApi provider, with a fixture body and no live search credit
- Console integration

`scripts/test-lp-structure.ts` and `npm test` were not run. The landing-page intelligence suite covers the offline landing-page host.

## Known Limitations

This installation has no Google OAuth client, developer token, or cloud project configured, so a live customer list and a live paused publish were not executed.

Quality score, average position, and lost impression share are outside the collector. The PDF control opens the browser print dialog. It does not write a PDF file. Rollback is the stored before and after snapshot. There is no separate undo mutate.

## Remaining Risks

A live account can still reject a mutate that the fake transport accepted, including campaign-criterion status, asset linking, and maximize-clicks bidding. That risk stays until an operator connects a test account and runs one paused publish plus one approved pause.

The cost-threshold pause rule is the only operational rule enabled by the operations pipeline. A campaign whose cost is above one micros can become a pause candidate. It still cannot run until the operator approves it and then executes it.

## Recommendations

Set the OAuth environment names in the server environment before the first live connection. Use a Google Ads test account for the first paused publish. Read the audit row after any approved change. Do not treat the print page as a stored PDF archive.

## Bug counts

Critical: 0. High: 0. Medium: 2. Low: 2.

Medium: quality score is not collected; PDF export is browser print rather than a file.

Low: average position and lost impression share are not collected; rollback information is stored and is not an automatic undo.
