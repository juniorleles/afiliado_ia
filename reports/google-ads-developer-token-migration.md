# Google Ads developer token migration — v3.2.0

Date: 2026-10-08

Google sunset developer tokens on September 9, 2026. API access now follows the Google Cloud project that owns the OAuth client. The Ads servers ignore a `developer-token` header and will reject it in a future major version. This installation stops sending that header and no longer requires `GOOGLE_ADS_DEVELOPER_TOKEN`.

## Required Variables

OAuth and later Ads calls use:

- `ADMIN_SESSION_SECRET` — at least 16 characters
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REDIRECT_URI` — `http://localhost:3000/configuracoes/integracoes/google-ads/retorno`

`GOOGLE_CLOUD_PROJECT` remains optional. It is shown on the integration page. The project that owns the OAuth client is the project Google uses for access, even when this name is empty.

## Removed Requirement

`GOOGLE_ADS_DEVELOPER_TOKEN` is not required for consent, account discovery, campaign synchronization, paused publishing, metrics, optimization, or approved execution. The name may remain in an old environment file. It is not placed on a request.

The integration page no longer lists a developer token. A Cloud project refusal is still reported as an access error. `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` is treated as a customer-access refusal. On API v25 that is the error for a project that still has test access and calls a production account. Older versions used `ACTION_NOT_PERMITTED` for the same case.

## API Version

The HTTP client now calls Google Ads API `v25`. `v21` is no longer in the supported version list. There is no third-party Google Ads client library in this repository. The existing HTTP client builds the requests.

Requests send `Authorization: Bearer` and, when a manager account is selected, `login-customer-id`. They do not send `developer-token`.

## Preserved

OAuth stays authorization-code with PKCE. Refresh tokens stay encrypted with the session secret. Account permissions, paused Search publishing, the approval workflow, and the audit log are unchanged. No database migration was added. The callback route is still `GET /configuracoes/integracoes/google-ads/retorno`.

## Validation

Typecheck passed. These suites passed with a fake Google transport and without a developer token in the environment:

- OAuth foundation
- Account discovery
- Safe publisher
- Live operations
- Offline authentication
- Live authentication
- Campaign publisher
- Ad group and RSA publisher
- Campaign synchronizer
- Metrics collector
- Google Ads Live RC1
- Console integration

No campaign was created. No ad was activated. No live Google call was made.

## Live Connection

The application can open consent and call the Ads API without a developer token. The Cloud project that owns the OAuth client must already have Google Ads API access. This check did not apply for that access and did not read an account.
