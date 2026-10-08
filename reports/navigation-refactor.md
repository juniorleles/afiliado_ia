# Navigation refactor — v3.1.1

Date: 2026-10-07

The operator console and the administration area are two menus. Routes, APIs, the database, and the business rules stayed in place.

## Old navigation

Operator sidebar (8 items):

1. Dashboard
2. Pesquisa de Mercado
3. Products
4. Lista de decisão
5. Oportunidades
6. Campanhas
7. Relatórios
8. Configurações

`/admin` used one header for Campanhas, with links Início, Lista, Transações, Readiness, Validation, and Discovery. Builder, media, history, product health, and analytics links sat on each campaign row.

## New navigation

Operator sidebar (7 items). Entry point: `/dashboard`.

1. Dashboard
2. Pesquisa de Mercado
3. Produtos
4. Watchlist
5. Campanhas
6. Relatórios
7. Configurações

Breadcrumbs for the search flow: Início → Pesquisa de Mercado → Resultados → Produto, and Início → Pesquisa de Mercado → Resultados → Landing page. The Watchlist trail is Início → Watchlist → Produto, Landing page, or Rascunho. `/oportunidades` stays on its URL and sits under Relatórios in the breadcrumb. It is not a primary menu item.

Administration header at `/admin`:

- Console (`/dashboard`)
- Campanhas
- Validation Lab
- Discovery
- Discovery Health
- Sources
- Queue
- Scheduler
- Readiness
- Transações
- Sair

LP Builder, Media Manager, Version History, Product Health, Analytics, and Visual concepts remain on each campaign inside `/admin`.

## Dashboard

`/dashboard` answers what to do next. It shows a welcome, the next action, the market search, latest searches, Watchlist summary, campaign summary, pending actions, system status (SearchApi, Google Ads, database), and quick actions. No secret values are shown.

## Routes preserved

No URL was renamed. `/lista` is still the Watchlist route. `/produtos`, `/campanhas`, `/relatorios`, `/configuracoes`, `/oportunidades`, and every `/admin` path are unchanged.

Checked after the menu change: `/dashboard`, `/pesquisa`, `/pesquisa/resultado`, `/produtos`, `/lista`, `/campanhas`, `/relatorios`, `/configuracoes`, `/oportunidades`, `/admin`, and the discovery, validation, and readiness pages return HTTP 200.

`/campanhas` shows drafts, status, publish, analytics, and Google Ads status. It does not link to LP Builder or Media Manager. `/configuracoes` shows SearchApi, Google Ads, language, theme, and Diagnóstico do sistema.

## Files changed

Navigation and labels:

- `src/components/layout/navigation.ts`
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/ui/icons.tsx`
- `src/components/ui/empty-state.tsx`
- `src/lib/ui/market-search.ts`
- `src/app/admin/layout.tsx`

Operator screens:

- `src/app/(console)/dashboard/page.tsx`
- `src/app/(console)/produtos/page.tsx`
- `src/app/(console)/lista/page.tsx`
- `src/app/(console)/campanhas/page.tsx`
- `src/app/(console)/relatorios/page.tsx`
- `src/app/(console)/configuracoes/page.tsx`
- `src/app/(console)/oportunidades/page.tsx`
- `src/app/(console)/not-found.tsx`
- `src/app/(console)/pesquisa/resultado/detalhe/page.tsx`
- `src/app/(console)/pesquisa/resultado/landing-page/page.tsx`
- `src/app/(console)/lista/produto/page.tsx`
- `src/app/(console)/lista/landing-page/page.tsx`
- `src/app/(console)/lista/rascunho/page.tsx`
- `src/components/operations/market-search-card.tsx`
- `src/components/operations/market-results-view.tsx`
- `src/components/operations/product-actions.tsx`
- `src/components/operations/watchlist-view.tsx`
- `src/components/operations/watchlist-actions.tsx`

Operator sentence for an empty keyword, still mapped from the existing host issue:

- `src/lib/console/gateway.ts`
- `scripts/test-console-integration.ts`

## UX improvements

- Seven primary items, in Portuguese, using business names.
- Oportunidades left the primary menu. The reading stays inside Relatórios.
- Discovery, Validation Lab, queue, scheduler, sources, readiness, and the builders are reached from Administração.
- Settings show health without secret values.
- The dashboard states the next action before the rest of the summaries.

## Validation

Console integration replay: `CONSOLE_INTEGRATION_PASS`. The empty keyword is still rejected before a search. Dashboard was opened in the browser: seven menu items, welcome, search, Watchlist, campaigns, pending actions, and system status were visible. Discovery and Validation Lab were absent from that menu and present on `/admin`.
