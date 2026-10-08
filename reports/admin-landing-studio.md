# Landing Page Studio — v3.1.1 execution 04

Date: 2026-10-08

The landing area of the campaign workspace is now one Landing Page Studio. The existing builder, visual editor, layout builder, media manager, version history, and preview stay the modules inside it. Their routes stay available.

## Workspace structure

The studio is `/admin/[id]/edit?aba=landing`. The tool is the `ferramenta` query, so a refresh keeps the same module.

Top to bottom:

1. Studio header: campaign name, product, brand, publication, last saved version (or the campaign update time), completion, and Prévia, Salvar, Publicar.
2. Tabs: Builder, Visual, Layout, Mídia, Versões, Prévia.
3. Three columns on a wide screen: block list, the open module, properties and publication.
4. On a narrower screen the block list becomes a horizontal scroller and the properties sit under the module.

The block list is Estrutura, Hero, Benefícios, Depoimentos, FAQ, CTA, and Rodapé. Choosing a block scrolls to that block in the open module. If the generated page has no such block, the studio says so.

The right side names the properties for the selected block (tipografia, espaçamento, imagens, botões, layout, fundo, visibilidade, metadados) and links to the module that already edits them. Publication shows policy, SEO, Google Ads, and publication status. SEO stays "Sem auditoria gravada" because this app has no SEO score. Google Ads shows "Google Ads não conectado" when the account is disconnected.

## Modules reused

- LP Builder (`BuilderEditor` and its live preview)
- Visual Editor
- Layout Builder
- Media Manager, including its grid, search, filters, upload, replace, and preview
- Version History, including timeline, author, date, restore, and diff
- The existing preview page, including `PreviewFrame`, theme, and layout frames

Salvar moves focus to the Save control already rendered by the open module. It does not add a second save path. Publicar opens the existing publication tab.

## Routes reused

- `/admin/[id]/edit?aba=landing&ferramenta=builder|visual|layout|media|versoes|preview`
- `/admin/lp-builder/[campaignId]`
- `/admin/lp-visual/[campaignId]`
- `/admin/lp-layout/[campaignId]`
- `/admin/lp-media/[campaignId]`
- `/admin/lp-versions/[campaignId]`
- `/admin/preview/[slug]`

The campaign menu now opens these tools inside the studio. The standalone routes still render their own headers.

## Files changed

- `src/app/admin/[id]/edit/landing-studio.tsx`
- `src/app/admin/[id]/edit/studio-frame.tsx`
- `src/app/admin/[id]/edit/workspace.tsx`
- `src/app/admin/campaign-board.tsx`
- `src/app/admin/lp-builder/[campaignId]/page.tsx`
- `src/app/admin/lp-visual/[campaignId]/page.tsx`
- `src/app/admin/lp-layout/[campaignId]/page.tsx`
- `src/app/admin/lp-layout/[campaignId]/layout-editor.tsx`
- `src/app/admin/lp-media/[campaignId]/page.tsx`
- `src/app/admin/lp-media/[campaignId]/media-editor.tsx`
- `src/app/admin/lp-versions/[campaignId]/page.tsx`
- `src/app/admin/preview/[slug]/page.tsx`

## UX improvements

The operator edits the landing page from one header, one tab row, and one block list. Desktop, tablet, and mobile preview widths switch in place (1280, 768, and 390). The embedded modules keep the live preview they already update.

## Known limitations

The embedded modules keep their existing English controls. The studio does not copy those controls into a second editor.

A page with no testimonials block cannot scroll to one. The studio reports that the block is absent.

Salvar focuses the module's existing Save button. Layout, media, and version actions keep their own buttons.

The property column points at the module that owns each property. It does not create a parallel property form.

Checked on campaign 184: every studio tab and the standalone builder, visual, layout, media, versions, and preview routes returned HTTP 200. In the browser, Visual opened the theme editor, Prévia rendered the current page, Celular set the canvas to 390px, and ArrowDown moved from Depoimentos to FAQ. At 390px the block list scrolls (572px inside a 358px track).
