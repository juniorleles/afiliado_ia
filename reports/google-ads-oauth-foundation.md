# Google Ads OAuth foundation — v3.2.0

Date: 2026-10-08

The operator connects Google Ads from Configurações → Integrações → Google Ads. The consent screen is OAuth 2.0 authorization code with PKCE. Tokens stay on the server.

## Architecture

The page lives in the console settings area and uses the administration design system. Middleware treats `/configuracoes/integracoes` as an admin route.

Environment names supply the OAuth client. `ADMIN_SESSION_SECRET` derives the AES-256-GCM key. One SQLite row, `google_ads_oauth`, stores the client id, client secret, and refresh token as ciphertext. Account labels, the customer id, and the last error are the only readable fields.

Token exchange and CustomerService reuse `google-ads-live`: `exchangeAuthorizationCode`, `exchangeRefreshToken`, and `readCustomers`. The offline Google Ads host is unchanged. Campaign, SearchApi, opportunity, product, and landing-page logic are unchanged.

## OAuth flow

1. Conectar Google Ads builds `https://accounts.google.com/o/oauth2/v2/auth` with the Ads scope, `access_type=offline`, `prompt=consent`, and S256 PKCE.
2. The state and the code verifier sit in an httpOnly cookie sealed with the session secret.
3. Google returns to `GOOGLE_ADS_REDIRECT_URI`. The callback checks the state, exchanges the authorization code, and stores the refresh token.
4. CustomerService (`customers:listAccessibleCustomers` and the existing customer read) checks that the account is accessible and the user is authorized.
5. Testar conexão repeats the refresh grant and the same customer read. The access token is not stored.
6. Desconectar removes the refresh token and the session fields. The encrypted client id, client secret, and environment remain.

## Files changed

- `src/lib/integrations/google-ads-oauth/environment.ts`
- `src/lib/integrations/google-ads-oauth/cipher.ts`
- `src/lib/integrations/google-ads-oauth/store.ts`
- `src/lib/integrations/google-ads-oauth/flow.ts`
- `src/lib/integrations/google-ads-oauth/status.ts`
- `src/lib/integrations/google-ads-oauth/state-cookie.ts`
- `src/lib/integrations/google-ads-oauth/access.ts`
- `src/lib/google-ads-live/oauth-manager.ts`
- `src/lib/db.ts`
- `src/lib/env.ts`
- `src/middleware.ts`
- `src/components/layout/navigation.ts`
- `src/app/(console)/configuracoes/page.tsx`
- `src/app/(console)/configuracoes/integracoes/page.tsx`
- `src/app/(console)/configuracoes/integracoes/google-ads/page.tsx`
- `src/app/(console)/configuracoes/integracoes/google-ads/actions.ts`
- `src/app/(console)/configuracoes/integracoes/google-ads/google-ads-mark.tsx`
- `src/app/(console)/configuracoes/integracoes/google-ads/conectar/route.ts`
- `src/app/(console)/configuracoes/integracoes/google-ads/retorno/route.ts`
- `.env.example`
- `scripts/test-google-ads-oauth-foundation.ts`

## Environment variables

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REDIRECT_URI`
- `GOOGLE_ADS_DEVELOPER_TOKEN` for CustomerService
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` optional manager id
- `GOOGLE_CLOUD_PROJECT` optional project id shown on the page
- `ADMIN_SESSION_SECRET` encryption key, at least 16 characters

None of these values are rendered. The page shows Configurado or Não configurado.

## Security review

Ciphertext is AES-256-GCM. The status object and the database file do not contain the client secret, the refresh token, the developer token, or the access token. The consent URL does not carry the client secret. The state cookie is httpOnly and is rejected when it is tampered with. A grant whose scope is not Google Ads is not stored. Connect, test, disconnect, and the callback require the admin session. Tokens are not written to browser storage and are not logged.

## Known limitations

This installation has not set the OAuth environment names, so the live Google consent screen was not opened. The connect route returns to the page with the configuration error. The authorization-code exchange, refresh token storage, reconnect, disconnect, and CustomerService success and refusal were verified with a fake Google transport and a temporary database.

Última sincronização stays Não sincronizado. This execution does not publish or synchronize campaigns. The access level is Autorizado after CustomerService succeeds; that call does not return the Google Ads user role. The older settings badge still means the legacy environment names are present. The developer token stays in the environment and is not part of disconnect.

Checked in the browser: the Google Ads page shows the connection panel, credential presence, and disabled actions while the environment is empty. At 390px and 768px the page stayed within the screen. Settings, Integrações, Google Ads, and the admin home returned HTTP 200.
