# Product Workspace — v3.1.1 execution 05

Date: 2026-10-08

The product area of the campaign workspace is now one Product Workspace. Product health, evidence, assets, and the product editor stay the modules inside it. Their routes stay available.

## Workspace structure

The workspace is `/admin/[id]/edit?aba=produto`. The area is the `ferramenta` query, so a refresh keeps the same tab.

Top to bottom:

1. Product header: product name, brand, category, current price, offer status, confidence score, last update, and campaign count.
2. Tabs: Visão geral, Saúde, Evidências, Ativos, Comercial, Campanhas, and Editor.
3. The open module.

The campaign header and the administration sidebar stay in place. The product workspace does not add a second primary menu.

## Tabs

| Tab | Query | What it shows |
| --- | --- | --- |
| Visão geral | `ferramenta=visao` | Summary, brand, category, price, observed sources, landing page link, completeness recommendation, commercial notes |
| Saúde | `ferramenta=saude` | Score cards, then the existing Product Health page |
| Evidências | `ferramenta=evidencias` | Existing evidence filters, observed facts, source, confidence, timeline, and a link to the landing studio |
| Ativos | `ferramenta=ativos` | Image, logo, and icon groups, then the existing media manager with search, filters, upload, and preview |
| Comercial | `ferramenta=comercial` | Price, offer type, bonuses, and call to action from the stored facts |
| Campanhas | `ferramenta=campanhas` | Campaigns with the same product name, publication badge, policy badge, and Abrir campanha |
| Editor | `ferramenta=editor` | The existing product editor |

## Reused components

MetricCard, Card, Badge, Button, WorkspaceTabs, Product Health page, FieldEvidencePanel, EvidenceFilterBar, Media Manager, and Product Editor page.

## Routes reused

- `/admin/[id]/edit?aba=produto&ferramenta=visao|saude|evidencias|ativos|comercial|campanhas|editor`
- `/admin/product-health/[campaignId]`
- `/admin/product-editor/[campaignId]`
- `/admin/product-evidence/[campaignId]`
- `/admin/lp-media/[campaignId]`

The campaign menu opens health and the editor inside the workspace. Completeness still opens the editor route so its in-page anchor keeps working. The standalone routes still render their own headers.

## Files changed

- `src/app/admin/[id]/edit/product-workspace.tsx`
- `src/app/admin/[id]/edit/product-evidence-list.tsx`
- `src/app/admin/[id]/edit/workspace.tsx`
- `src/app/admin/campaign-board.tsx`
- `src/app/admin/product-health/[campaignId]/page.tsx`
- `src/app/admin/product-editor/[campaignId]/page.tsx`

## UX improvements

The operator reads the product from one header and one tab row. Score cards sit above the existing health page. Evidence and assets stay the current modules. Related campaigns open the campaign workspace.

## Known limitations

Product facts have no category, upsell, downsell, or funnel field. Those values stay "Não observada" or "Não observado". Videos and downloads are not media roles, so those cards say none were observed.

The confidence figure is the existing completeness score. Compliance is the internal policy gate. Risk is the count of import warnings. The image card shows the observed image provenance.

Opening Saúde renders the existing Product Health page, which records a completeness analysis the same way the standalone route does.

The embedded evidence and media controls stay in English. Saving the product editor still follows that page's existing redirect.

Checked on campaign 184: every product tab and the standalone editor and health routes returned HTTP 200. In the browser, Evidências listed observed facts and the timeline, Ativos mounted the media manager, Campanhas linked to `/admin/184/edit`, and ArrowRight moved focus from Campanhas to Editor. At a 358px track the product tabs scroll (630px).
