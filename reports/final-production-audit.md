# Final production audit — RC2

Date: 2026-10-07  
Platform label: AI Affiliate Platform v3.1  
Package: `afiliado_ia` 0.1.0  
Decision: READY FOR OPERATION

Evidence for the live search, database stamps, and Google Ads refusal is in `reports/rc2-production-audit-run.json`. The earlier file `reports/final-validation-run.json` was not overwritten.

## Executive Summary

The operator console, the existing hosts, the production build, and the RC1 acceptance replays completed without a critical or high defect. One authorized SearchApi search for `joint pain supplement` (US, en, desktop) returned status OK in 4453 ms, with 9 organic results and 0 sponsored results. The collector did not invent landing pages or products. Google Ads is Not Connected: campaign, ad group, and RSA validators refused, `sent` stayed false, and `data/presell-os.db` did not change. The console routes answered HTTP 200, showed the stored keyword, and did not render secret values.

## Infrastructure Summary

| Check | Result |
| --- | --- |
| Node | v20, required by `docs/PRODUCTION_DEPLOYMENT.md` (Node 20+) |
| TypeScript | `npx tsc --noEmit` exited 0 (`TSC_PASS`) |
| Build | `npx next build` (Next.js 15.5.23) exited 0 after the dev server was stopped |
| Dependencies | `next` ^15.1.0, `react` ^19.0.0, `better-sqlite3` 11.10.0, `typescript` ^5.7.0. The production build resolved the installed tree |
| SearchApi | Presence `SET`. The value stays in `.env.local` and is not returned by settings |
| Google Ads | `Not Connected`. Client id, client secret, developer token, refresh token, and customer id are absent |
| OAuth | No refresh token, so no authenticated Google Ads session was opened |
| Database | `presell-os.db` 1282048 bytes, mtime 2026-09-25T18:04:01.761Z, identical before and after the search. WAL and SHM stamps also matched. `listCampaigns()` read 2 campaigns |
| Filesystem | The search record is `data/console/searches/s-muyhen86-joint-pain-supplement.json` |
| Configuration | Console language `pt-BR`, public language `en`, `DEMO_PUBLISH` `MISSING` |

`.env` is absent. `.env.local` is present and was not printed.

## Frontend Summary

These routes returned HTTP 200 with no secret material and no example catalog names: `/dashboard`, `/pesquisa`, `/pesquisa/resultado`, `/lista`, `/produtos`, `/oportunidades`, `/campanhas`, `/relatorios`, `/configuracoes`. `/api/health` returned 200.

Dashboard, search, results, and Monitoramento show the keyword `joint pain supplement`. Products and Oportunidades show their empty states. The watchlist shows “A fila está vazia.” Campanhas, Configurações, and Monitoramento show `Not Connected`. Settings copy states that no secret is shown. SearchApi is labeled Configurado.

Theme controls are in the header (`aria-label="Tema"`). The shell has `nav[aria-label="Principal"]` and `main#conteudo`. Loading uses `aria-label="Carregando a página"`. An empty keyword is rejected before a search. A missing `busca` id falls back to the latest saved search (medium, below).

## Backend Summary

The console gateway calls the existing search, normalizer, landing, product, market, and opportunity hosts, then the campaign validator. This run reached the normalizer. With zero https sponsored URLs, landing collection, product identification, the market report, and opportunity scoring were not fed invented inputs. `createCampaignPublisher().validator` was not asked to publish. Optimization sent no metrics request.

## Search Summary

| Field | Value |
| --- | --- |
| Keyword | joint pain supplement |
| Country / language / device | US / en / desktop |
| Status | OK |
| Issues | none |
| Elapsed | 4453 ms |
| Sponsored | 0 |
| Organic | 9 |
| Credits | one authorized search. No second call |

The normalizer accepted the payload. Empty `ads`, `shopping_ads`, and `inline_shopping` with status OK means those lists were absent or empty. Organic titles are article titles from that SERP, including “12 Supplements for Osteoarthritis” and “7 Supplements for Joint Pain”.

## Landing Page Summary

Maximum requested: 3. Collected: 0. No https sponsored URL was present, so no HTTP fetch, redirect chain, metadata read, or HTML save ran. The stage did not invent pages. The frozen validation file from earlier the same day, which was not modified, records 37 sponsored results for this keyword. That file is historical evidence that the collector runs when the SERP contains sponsored URLs. This audit does not treat the empty list as a collector defect.

## Product Intelligence Summary

Observed products: 0. Brand, category, and price lists are empty because no landing page was identified. The evidence graph, commercial intelligence, and product report were not built from invented products. `/produtos` renders the empty state. The Product Intelligence RC1 acceptance replay passed on its fixtures.

## Market Intelligence Summary

Market report brands, categories, prices, warnings, and missing evidence are empty. Opportunity score, rank, and recommendation are null. `/oportunidades` renders “Nenhuma oportunidade”. Monitoramento states “0 patrocinados, 9 orgânicos, 0 marcas”, “0 Products observados”, and “Sem recomendação nesta busca.” The Market Discovery and Opportunity Engine RC1 replays passed.

## Campaign Summary

Google Ads status: Not Connected. A paused draft was validated with an empty customer id and an empty developer token. The campaign validator returned missing session, missing customer, and missing developer token. The ad group validator also required a published paused campaign and a draft. The RSA validator also required a paused ad group and an RSA draft. `sent` is false. No mutate was sent. The database file did not change. The campaigns screen lists the local Not Connected state and can read the two existing database campaigns.

## Optimization Summary

No live Google Ads campaign is connected. The optimization line is “Not Connected. No metrics request was sent.” Monitoramento shows the same Not Connected label for Otimização. Pending actions were not created and were not executed. The Optimization Engine RC1 replay passed on its scripted account.

## Performance Summary

Production build, shared first-load JavaScript: 103 kB (46.4 kB + 54.2 kB + 2.09 kB). Console first-load sizes from that build: dashboard 156 kB, pesquisa 156 kB, resultados 154 kB, lista 157 kB, produtos / oportunidades / campanhas / relatórios about 108 kB, configurações 106 kB. Middleware 37.6 kB.

Dev server, first compile of `/dashboard`: 22.6 s. After compile, a headless sweep of the nine console routes at 1440×900 took 1.1–3.2 s per navigation. The live search took 4453 ms. Nine organic rows are one page; there is no extra pager. No crash occurred during the sweep. A heap profile was not captured.

## Accessibility Summary

Targeted checks, not a certified WCAG audit:

- Dark theme heading contrast measured 17.14:1 (`rgb(245, 247, 251)` on `rgb(18, 20, 28)`).
- The console integration replay already measured dark primary text `#c5cdf8` on `#1b1e2a` and light primary text `#2f3cc9` on `#ffffff`, both at or above 4.5:1.
- `#market-keyword` accepts programmatic focus. Tab moves focus off that field.
- Principal navigation, main content, theme group, and watchlist filters expose names.
- `prefers-reduced-motion: reduce` computes `--duration-fast` as `0s`.

## Responsive Summary

Headless Edge at 1440×900, 768×1024, and 390×844 loaded all nine console routes at HTTP 200. Document scroll width did not exceed the viewport. Each page exposed a heading, `main`, and the principal nav.

## Security Summary

Settings return presence labels only. Fetched console HTML did not match secret assignment patterns. The audit JSON stores hosts and titles, not API keys and not tracking URLs. The dev server log for this sweep did not print a SearchApi or Google Ads secret. Google Ads requests were not sent. The search did not write the SQLite database.

## Regression Summary

`REGRESSION_DONE failed=0` for:

- Platform Kernel
- Market Discovery (search connector, SERP parser, sponsored detector, landing collector, product identifier, market report)
- Product Intelligence
- Opportunity Engine
- Traffic, Decision, Workflow, Execution Planner
- Google Ads and Google Ads Live
- Optimization Engine
- Frontend console integration, including watchlist roundtrip, path-traversal refusal, and primary-text contrast

There is no separate Discovery RC1 acceptance script. The Market Discovery replay is the discovery chain. Snapshots in those replays stayed frozen. `reports/final-validation-run.json` was not rewritten.

An isolated watchlist check in a temporary directory created one item, updated it to status `revisao`, priority `high`, notes “Nota de auditoria.”, and four timeline events, then removed it and reread an empty queue.

## Known Limitations

- This SERP had no sponsored results, so landing pages, observed products, and the opportunity score were empty on purpose.
- Google Ads credentials are absent. Drafts are validated locally and are not created in an account.
- Watchlist notes live in `data/console/`, not in a domain table. A second machine does not share that directory.
- The project has no ESLint config, so lint was not executed.
- `/pages/ui-preview`, `/ux-preview`, and `/prototype` still show design examples.
- `/operations-preview` returns 404.
- A `busca` id that is not on disk falls back to the latest saved search.
- Console routes have no `error.tsx`. Next.js uses its default error page.
- `package.json` version remains 0.1.0. The production label for this audit is v3.1.

## Operational Notes

Start the app with `npm run dev` so the Dev Server Manager owns the single `next dev`. Do not run `next build` against that same `.next` directory. This audit stopped the previous server, removed `.next`, built, then started one server again on port 3000.

One SearchApi credit was spent. Do not repeat the keyword search unless a later defect requires it. Remaining credit balance was not requested.

Public pages stay English. The console stays `pt-BR`. Publication, deploy, and ad sends were not performed.

## Deployment Notes

`docs/PRODUCTION_DEPLOYMENT.md` is the operator checklist: Node 20+, `next start`, SQLite on a persistent disk, secrets server-side, `AIA_ENV=production` for production checks. `next build` in this audit used the local env and did not deploy. `README.md` describes the console, `data/console/`, and the Not Connected behavior.

## Remaining Risks

- A SERP with no sponsored results ends the operator journey at organic titles. The next search that contains https sponsored URLs is what fills products, the market report, and the watchlist.
- `data/console/` is local. Deleting `data/` clears the saved search and the queue.
- Google Ads stays unavailable until credentials exist. Connecting them is a later, explicit step. This audit did not add them.
- Unknown search ids silently show another search.

## Bug counts

| Severity | Count | Items |
| --- | --- | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | Unknown `busca` id falls back to the latest saved search |
| Low | 3 | `/operations-preview` is 404; preview galleries still use examples; no console `error.tsx` |

## Final decision

READY FOR OPERATION
