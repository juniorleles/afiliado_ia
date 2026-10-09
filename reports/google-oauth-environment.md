# Google OAuth environment — v3.2.0

Date: 2026-10-08

The current Google Ads connection reads environment names on the server. It does not accept a pasted refresh token. This inspection did not change code and did not print any secret value.

## Required Variables

These four must be non-empty before Conectar Google Ads can open the consent screen. `googleAdsEnvironmentReady` is true only when the first three are present, and `googleAdsEncryptionReady` also requires the session secret.

| Name | Rule |
| --- | --- |
| `ADMIN_SESSION_SECRET` | At least 16 characters. It seals the OAuth state cookie and is the AES-256-GCM key for stored credentials. |
| `GOOGLE_ADS_CLIENT_ID` | OAuth client id sent on the consent URL. |
| `GOOGLE_ADS_CLIENT_SECRET` | Used when the authorization code is exchanged. It is not placed on the consent URL. |
| `GOOGLE_ADS_REDIRECT_URI` | An `http` or `https` URL with no username or password. It is sent to Google as `redirect_uri` and must match the URI registered in Google Cloud. |

`GOOGLE_ADS_DEVELOPER_TOKEN` is not required to open the consent screen. It is required immediately afterward. Without it, the refresh token is stored and the page reports that the account read needs the developer token. CustomerService, discovery, publishing, and live operations all refuse to call Google Ads until this name is set.

## Optional Variables

| Name | Rule |
| --- | --- |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Manager customer id. Hyphens are removed. The value is kept only when it is exactly 10 digits. It is sent as `login-customer-id` when it differs from the selected customer. |
| `GOOGLE_CLOUD_PROJECT` | Cloud project id shown on the integration page. It is kept when it has no spaces and is at most 80 characters. |
| `GOOGLE_ADS_CLOUD_PROJECT` | Alternate name for the same project id. `GOOGLE_CLOUD_PROJECT` is read first. |

`GOOGLE_ADS_REFRESH_TOKEN` and `GOOGLE_ADS_CUSTOMER_ID` are not read by the consent flow. The refresh token is stored only after Google returns an authorization code. Those two names still exist in the older settings badge, which reports Connected only when `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`, and `GOOGLE_ADS_CUSTOMER_ID` are all non-empty. That badge is separate from the integration center.

## Expected Callback URL

The implemented callback is `GET /configuracoes/integracoes/google-ads/retorno`.

The example registered for local development is:

`http://localhost:3000/configuracoes/integracoes/google-ads/retorno`

Consent starts at `GET /configuracoes/integracoes/google-ads/conectar` and redirects to `https://accounts.google.com/o/oauth2/v2/auth`. The scope is `https://www.googleapis.com/auth/adwords`. The return route checks the `code` and `state` query parameters, opens the `aia_gads_oauth` cookie, and exchanges the code.

## Environment Example

```
ADMIN_SESSION_SECRET=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REDIRECT_URI=http://localhost:3000/configuracoes/integracoes/google-ads/retorno
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_CLOUD_PROJECT=
```

## Files Reading Variables

- `src/lib/integrations/google-ads-oauth/environment.ts` reads the Google Ads names and the cloud project.
- `src/lib/integrations/google-ads-oauth/cipher.ts` reads `ADMIN_SESSION_SECRET` for encryption.
- `src/lib/integrations/google-ads-oauth/state-cookie.ts` reads `ADMIN_SESSION_SECRET` for the state cookie.
- `src/lib/integrations/google-ads-oauth/flow.ts` uses that environment for consent, code exchange, and CustomerService.
- `src/lib/integrations/google-ads-oauth/status.ts` turns the same names into presence labels.
- `src/lib/env.ts` lists the names. In production it requires `ADMIN_SESSION_SECRET`. The Google Ads names are not required for the app to boot.
- `src/app/(console)/configuracoes/integracoes/google-ads/conectar/route.ts` starts consent.
- `src/app/(console)/configuracoes/integracoes/google-ads/retorno/route.ts` receives the callback.
- `src/lib/integrations/google-ads-publish/publish.ts`, `src/lib/integrations/google-ads-operations/pipeline.ts`, and `src/lib/integrations/google-ads-operations/execute.ts` use the client id, client secret, and developer token after a refresh token is stored.
- `src/lib/console/configuration.ts` reads the older five-name badge, including `GOOGLE_ADS_REFRESH_TOKEN` and `GOOGLE_ADS_CUSTOMER_ID`.

## Missing Variables

Checked in `.env.local` and the process environment. Presence only:

| Name | State |
| --- | --- |
| `ADMIN_SESSION_SECRET` | missing |
| `GOOGLE_ADS_CLIENT_ID` | missing |
| `GOOGLE_ADS_CLIENT_SECRET` | missing |
| `GOOGLE_ADS_REDIRECT_URI` | missing |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | missing |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | missing |
| `GOOGLE_CLOUD_PROJECT` | missing |
| `GOOGLE_ADS_CLOUD_PROJECT` | missing |
| `GOOGLE_ADS_REFRESH_TOKEN` | missing |
| `GOOGLE_ADS_CUSTOMER_ID` | missing |

The consent screen cannot open until the session secret, client id, client secret, and redirect URI are set. Account discovery also needs the developer token.
