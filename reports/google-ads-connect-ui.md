# Google Ads connect UI — v3.2.0

Date: 2026-10-08

The operations page at `/admin/google-ads/operacoes` could synchronize a published campaign, but it had no control that started OAuth. The consent route already existed at `GET /configuracoes/integracoes/google-ads/conectar`.

## Disconnected state

When no account is connected, the page shows Status `Not Connected` and a native link labeled `Connect Google Ads`. The link address is `/configuracoes/integracoes/google-ads/conectar`. It is an ordinary GET. The synchronize button stays disabled until the connection status is Conectado.

## OAuth start and return

The connect route still redirects to the Google consent screen. If the request comes from the operations page, the return cookie sends the callback back to `/admin/google-ads/operacoes`. That redirect reloads the page from the server.

After a successful connection the same page shows Google account, Customer ID, Manager account, Timezone, Currency, Refresh token status, and Last synchronization. Those values come from the stored account record. The refresh token is shown only as Configurado or Não configurado.

## Failure

A Google `error` code that matches a short lowercase token is shown as `Código do Google`. The callback does not copy `error_description`, client secrets, or the refresh token into the page. A refusal such as `access_denied` leaves the status at Not Connected and keeps synchronization disabled.

## Publishing

Paused Search publishing is unchanged. Created campaign, ad group, and ad statuses stay PAUSED. An enabled status is still refused. Approval is still required before an operations action is executed.

## Check

The live operations page showed Not Connected, the connect link, and a disabled Sincronizar button. Following the link opened the Google consent screen and stopped before sign-in. A callback with `error=access_denied` returned to the operations page and showed that code only.
