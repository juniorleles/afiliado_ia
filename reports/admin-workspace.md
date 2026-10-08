# Administration campaign workspace — v3.1.1 execution 03

Date: 2026-10-08

Abrir campanha opens `/admin/[id]/edit`. That existing route is now the campaign workspace. The standalone tool routes stay in place.

## Workspace structure

Top to bottom:

1. Campaign header: name, product, brand, publication and policy badges, completion, last edit, Publicar, Duplicar, Excluir.
2. Persistent tabs. The choice is the `aba` query on the edit route, so a refresh keeps the same area.
3. Workspace content for the selected tab.
4. Action bar: Prévia or Ver página, and Validação.

Breadcrumb: Administração > Campanhas > the campaign name.

There is one administration sidebar. The workspace does not add a second primary menu.

## Tabs

| Tab | Query | What it shows |
| --- | --- | --- |
| Visão geral | none | Status, publication, completion, policy, Google Ads, last edit, recent versions, quick actions, and the existing campaign form |
| Landing page | `aba=landing` | Conteúdo, Visual, Layout, Mídia, Versões via `ferramenta` |
| Produto | `aba=produto` | Editor or Saúde, plus the evidence export |
| Validação | `aba=validacao` | One policy score, Links, and the stored HTML, performance, and accessibility reading when a visual audit exists. Verificação or Laboratório |
| Análises | `aba=analytics` | The existing campaign analytics page, including traffic, CTR, and conversions |
| Publicação | `aba=publicacao` | Publication status, Google Ads, internal approval, Sincronizar, and the existing publish panel |
| Histórico | `aba=historico` | The existing version history, including changes and restores |

On a 390px viewport the tab row scrolls (686px of tabs inside a 358px track) and the Menu button is available. ArrowRight moves focus from Publicação to Histórico.

## Reused components

Card, Badge, Button, the existing CampaignForm, DuplicateButton, DeleteButton, UnpublishButton, and the page modules for the LP builder, visual editor, layout builder, media manager, version history, product editor, product health, policy lint, validation lab, analytics, and publish panel.

## Routes reused

- `/admin/[id]/edit`
- `/admin/lp-builder/[campaignId]`
- `/admin/lp-visual/[campaignId]`
- `/admin/lp-layout/[campaignId]`
- `/admin/lp-media/[campaignId]`
- `/admin/lp-versions/[campaignId]`
- `/admin/product-editor/[campaignId]`
- `/admin/product-health/[campaignId]`
- `/admin/product-evidence/[campaignId]`
- `/admin/[id]/lint`
- `/admin/validation`
- `/admin/[id]/analytics`
- `/admin/[id]/publish`
- `/admin/preview/[slug]` and `/p/[slug]`

Direct requests to `/admin/184/lint` and `/admin/lp-builder/184` still return 200.

## Files changed

- `src/app/admin/[id]/edit/page.tsx`
- `src/app/admin/[id]/edit/workspace.tsx`
- `src/app/admin/[id]/edit/workspace-tabs.tsx`
- `src/app/admin/campaign-board.tsx`
- `src/app/admin/delete-button.tsx`
- `src/app/admin/duplicate-button.tsx`
- `src/app/admin/unpublish-button.tsx`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/navigation.ts`

## Known limitations

- The embedded tools keep their own links. Those links still open the standalone routes.
- Saving the campaign form still follows the existing redirect to `/admin`. Saving the product editor still follows the existing redirect to `/admin/product-editor/[id]`.
- Opening Saúde do produto runs the same completeness write the standalone health page already runs.
- Sincronizar does not call Google Ads. When the account is disconnected the tab shows “Google Ads não conectado” and the button stays disabled.
- The single validation score is the existing policy linter score. It is not a Google Ads approval. SEO has no stored audit. HTML, performance, and accessibility use the latest stored visual audit when one exists; otherwise they say there is no stored audit. Lighthouse remains unused, as in that audit.
- Google Ads on the header is the account connection, not a per-campaign ads status. Marca is the manufacturer on the campaign facts.
- Versões under Landing page and the Histórico tab both render the same version history page.
- The reused tool pages keep their previous English chrome.
