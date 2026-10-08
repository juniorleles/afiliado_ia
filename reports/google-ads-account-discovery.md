# Google Ads account discovery — v3.2.0

Date: 2026-10-08

After OAuth, the integration reads every accessible Google Ads account and lets the operator choose one active account. The read uses search. It does not call a mutate method.

## OAuth status

The existing authorization-code flow is unchanged. A successful grant still stores the refresh token encrypted. Discovery runs immediately after CustomerService accepts the grant. Reconnect repeats the same read and keeps the account that was already selected. Disconnect removes the refresh token, the discovered accounts, and the health row.

## Accounts found

CustomerService lists accessible customers. Manager accounts also contribute their child accounts. Each stored row has the customer id, name, currency, time zone, manager flag, test-account flag, status, and access level. Campaign totals count enabled, paused, and removed campaigns from a read-only campaign query.

When more than one account is returned, none becomes active until the operator selects one. A single account is selected automatically.

## Selected account

Only one row stays selected. The dashboard follows that row: name, customer id, currency, time zone, manager flag, campaign counts, and access level.

## Permissions

Campaign read, ad groups, ads, keywords, reporting, and assets are probed with search. A successful read is Concedida. A permission refusal is Ausente. Campaign write is Concedida only when the observed access role is Administrador or Padrão. A read-only role stays Ausente. No write was sent.

## Google Ads API status

A completed discovery sets the API to Operacional and the sync state to Conectado. A customer refusal sets Erro de permissão. A refused token sets Precisa de autorização. With no session the state is Desconectado. The recorded API version is v21.

## Connection health

The health card shows OAuth, the Google Ads API, refresh-token presence, the active customer, scope presence, latency, the last successful sync, and the last error. Secrets are not on the card.

## Files changed

- `src/lib/integrations/google-ads-oauth/discovery.ts`
- `src/lib/integrations/google-ads-oauth/flow.ts`
- `src/lib/integrations/google-ads-oauth/store.ts`
- `src/lib/integrations/google-ads-oauth/status.ts`
- `src/lib/db.ts`
- `src/app/(console)/configuracoes/integracoes/google-ads/page.tsx`
- `src/app/(console)/configuracoes/integracoes/google-ads/actions.ts`
- `scripts/test-google-ads-oauth-foundation.ts`
- `scripts/test-google-ads-account-discovery.ts`

## Security review

Discovery sends the access token and the developer token only as request headers inside the server. Neither value is stored on the account row or rendered. Account selection accepts a 10-digit customer id that is already in the local list. The admin session still guards connect, refresh, select, and disconnect. The test transport recorded no mutate URL, and the local campaigns table was unchanged.

## Known limitations

This installation still has the OAuth environment names unset, so a live Google account list was not fetched. Discovery, selection, reconnect, and the campaign counts were verified with a fake Google transport and a temporary database.

Campaign write is inferred from the access role. It is not proven by a mutate call. If several users appear on the account, the role is left unobserved and write stays Ausente. Child accounts are read with the manager id in the login-customer header. The older settings badge still means the legacy environment names are present.
