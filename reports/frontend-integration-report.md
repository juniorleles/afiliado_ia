# Frontend integration

The operator console now calls the existing platform hosts. Domain models, backend services, and the design system were left in place. The console no longer ships the example catalogs (North Offer, Plain Offer, Zebra Offer, Dynamic Joint).

## Architecture summary

The console is a presentation layer.

- Search, normalization, landing-page collection, product identification, the market report, scoring, ranking, portfolio, and recommendations are the existing hosts.
- Campaign rows already stored in `presell-os.db` are listed through `listCampaigns()`.
- A paused draft is checked with the existing Google Ads campaign validator. The publisher is not called.
- Operator state that has no domain table (search archive, watchlist notes, status, priority, timeline, local drafts, landing HTML) is stored under `data/console/`. That directory is gitignored with the rest of `data/`.
- Settings read whether `SEARCHAPI_API_KEY` and the Google Ads variables are present. Values are not returned.

## Integrated modules

| Screen | Source |
| --- | --- |
| Dashboard, Pesquisa | SearchApi provider, normalizer, landing session, product session, market report, opportunity engines |
| Resultados, Product, Landing Page | Stored search plus the collected HTML |
| Products | Observed products from stored searches |
| Oportunidades | Score, rank, and recommendation from the same run |
| Lista de decisão | Persisted queue, notes, status, priority, timeline |
| Campanhas | Local paused drafts plus database campaigns |
| Relatórios | Market, product, opportunity, optimization, and execution readings from the latest search |
| Configurações | Theme control already in the header, language labels, SearchApi and Google Ads presence |

## Remaining limitations

- The domain database has no watchlist table. Notes and history live in `data/console/`, on this machine.
- A search spends one SearchApi credit and fetches landing pages. This integration run did not execute a keyword search.
- Opportunity output is one recommendation for the keyword, not a separate score on every product.
- Google Ads drafts are validated locally and are not created in an account.
- Optimization metrics are not collected.
- `/pages/ui-preview`, `/ux-preview`, and `/prototype` still show design examples. They are not the operator console.

## Known risks

- `data/console/` is local. A second server, or a deleted `data/` directory, starts from an empty queue.
- Landing HTML is the page that was fetched. The preview iframe uses an empty sandbox so scripts in that HTML do not run.
- Dark-theme navigation text now uses `#C5CDF8` on the dark surface. The measured pair is above 4.5:1. Light text stays `#2F3CC9` on white.

## Performance summary

Results, products, and reports render from the stored record. Landing HTML is loaded only on the preview route. Filters on results and the queue run in the browser over that record. Empty keyword rejection returns before a provider request.

## Accessibility summary

The active sidebar item, its icon, link buttons, and the selected menu item use `text-primary-text`. In the dark theme that token is `#C5CDF8` on `#1B1E2A` (above 4.5:1). In the light theme it remains `#2F3CC9` on white (above 4.5:1). The keyword field keeps its label, autofocus, and Ctrl+K shortcut. Status text uses a live region. Reduced motion still zeroes the design-system durations.

## Responsive summary

The console shell is unchanged: fixed sidebar at 1280px, 64px rail from 768px to 1279px, and the menu drawer below 768px. The new sections use the existing grid and card components.

## Google Ads status

Not Connected. The required Google Ads variables are not set. No campaign resource is created and no metrics request is sent.

## SearchApi status

The key is present in the environment. The console calls the existing provider when the operator submits a keyword. An empty keyword is rejected before that call. This integration did not spend a credit.

## Deployment notes

`PUBLISH=NO`. `DEPLOY=NO`. `ADS=NO`.

Run `npm run dev` for the local console. Production start uses the same `data/` directory and `.env.local`. Do not commit `data/`, `.env`, or `.env.local`.
