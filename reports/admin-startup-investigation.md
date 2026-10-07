# Admin console startup investigation

Date: 2026-10-07  
URL: http://localhost:3000/admin  
Decision: the blank page is gone. No application source file was changed.

## Root Cause

The Next.js dev server on port 3000 was still accepting connections, but it had stopped writing response bodies. `GET /admin` and `GET /dashboard` both returned HTTP 200 with a chunked body of 0 bytes, no `Content-Type`, and none of the middleware headers (`x-aia-route-class`, CSP). The process log had also stopped recording those requests. A browser renders that response as a blank page.

The route, layout, and React tree were not the failure. After the single `npm run dev` process was stopped and started again, `GET /admin` returned `text/html` (76,322 bytes) and the campaign list painted.

The stuck process was `next dev --turbopack` (start-server pid 42052), left over from the earlier session. It was not a second server. Restart used the Dev Server Manager on port 3000 only.

## Files Changed

None. The admin page, admin layout, root layout, and middleware were left as they are.

## Reason

`/admin` is an App Router server page (`src/app/admin/page.tsx`) inside `src/app/admin/layout.tsx`. Middleware classifies `/admin` as ADMIN. With `ADMIN_PASSWORD` unset, development skips the login redirect (`adminAuthBypassed`). `listCampaigns()` returned the two stored campaigns. The empty HTTP body came from the wedged dev process, so there was no component, import, or environment defect to patch.

## Validation

Restarted server: Next.js 15.5.23, Ready on port 3000.

| Screen | Result |
| --- | --- |
| http://localhost:3000/admin | HTTP 200. Heading “Campanhas”. Header “Afiliado IA · Admin”. Nav: Início, Lista, Transações, Readiness, Validation, Discovery, Sair. Two campaigns listed (Joint Genesis fixture, neuro serge). |
| http://localhost:3000/admin/transactions | HTTP 200. Heading “Transactions”. Empty state: “No ClickBank notifications stored yet.” |
| http://localhost:3000/admin/system/readiness | HTTP 200. “Production readiness”. DATABASE READY. Copy states that secrets are never shown. |

The admin chrome is the header and that nav. There is no separate sidebar on this route. Navigation from Lista to Transações and to Readiness changed the URL and replaced the page body.

Body computed style after paint: background `rgb(9, 9, 11)`, text `rgb(244, 244, 245)`. Visible text length on `/admin` was 869 characters.

## Browser Console Output

No JavaScript exception and no hydration error on `/admin`.

One console error during the session: `Failed to load resource: the server responded with a status of 404 (Not Found)`. The dev log shows `GET /admin/preview/joint-genesis-controlled-ready-13 404`. That request is not the admin document. The document itself stayed 200 and remained on screen.

The Next.js dev tools button is present. It is not an error overlay.

## Network Output

Before the restart:

- `GET /admin` → 200, 0 bytes, no `Content-Type`
- `GET /dashboard` → 200, 0 bytes, no `Content-Type`

After the restart:

- `GET /admin` → 200, `text/html; charset=utf-8`, 76,322 bytes, `x-aia-route-class: ADMIN`
- `GET /admin/transactions` → 200
- `GET /admin/system/readiness` → 200
- Subresources used by the painted page: 21, none empty

No SearchApi call and no Google Ads call are required to render this page. Both were absent from the request log.

## Environment

Checked by variable name only. Values were not printed.

| Name | Presence |
| --- | --- |
| SEARCHAPI_API_KEY | SET |
| GOOGLE_ADS_CLIENT_ID, CLIENT_SECRET, DEVELOPER_TOKEN, REFRESH_TOKEN, CUSTOMER_ID | MISSING |
| ADMIN_PASSWORD | MISSING |
| ADMIN_SESSION_SECRET | MISSING |
| NEXT_PUBLIC_* | none |
| PUBLIC_SITE_URL | MISSING |

Missing Google Ads credentials do not affect `/admin`. Missing `ADMIN_PASSWORD` in development opens the console without the login form. The page still renders the campaign list.

## Result

SERVER=PASS  
ROUTE=PASS  
REACT=PASS  
LAYOUT=PASS  
API=PASS  
ENVIRONMENT=PASS  
RUNTIME=PASS  
BLANK_PAGE_FIXED=YES
