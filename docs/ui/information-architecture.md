# Information Architecture

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 01
Ruleset: UI_UX_GLOBAL_RULES_V1
Status: documentation only. No screen in this document is implemented by this execution.

## Audiences

Two audiences stay separate.

The operator uses the authenticated console. Labels in the target navigation are Portuguese. The operator decides what may be published. Nothing in this architecture publishes a presell or a Google Ads entity by itself.

The visitor uses the public site in English. The public site lists published reviews and the legal pages. The ad final URL is the public presell at `/p/[slug]`. The affiliate hop happens only when the visitor uses the call to action on that page.

## Current interface

The operator shell is `src/app/admin/layout.tsx`. Every authenticated page shares one heading, "Campanhas", and one short nav: Início, Lista, Transações, Readiness, Validation, Discovery, Sair.

The campaign list at `/admin` is the operator home. Each row repeats publication state, policy gate, completeness, slug, and twelve links into editors, preview, analytics, and history.

Market search, observed products, opportunity ranking, Google Ads drafts, and optimization recommendations exist as engines. They have no operator screen. The operator cannot walk from a search to a chosen product to a campaign without leaving the business task and opening technical tools.

The public shell is `PortalShell`. Primary nav: Home, Reviews, About, Editorial Policy. Footer repeats those links and adds Affiliate Disclosure, Privacy Policy, Terms, and Contact.

## Duplicated information

- The layout heading "Campanhas" is shown on Transações, Readiness, Validation, Discovery, and every campaign tool.
- Each campaign row repeats links that the LP Builder, Preview, and Product Editor also show: Visual Editor, Media Manager, Layout Builder, History, Preview.
- LP Builder, Visual Editor, Media Manager, Layout Builder, and History each exist twice: `/admin/lp-*/[campaignId]` and `/admin/lp-*/slug/[slug]`.
- Completeness appears on the campaign list, Product Health, and Product Editor.
- Policy gate appears on the campaign list, Policy Check, and Publish.
- Discovery dashboard repeats registered-source counts in the Sources block and again in Statistics.
- Portal header and footer render the same site links.
- Preview is reachable as admin preview, candidate preview, visual frame, visual-frame lab, and validation frame.

## Technical information exposed to the operator

These values are useful to the system and should leave the primary business screens:

- Campaign id, slug, and the literal path `/p/[slug]`
- Policy codes `READY`, `REVIEW_REQUIRED`, `BLOCKED`
- Publication tokens `DRAFT` and `PUBLISHED`
- Completeness as a raw percentage without the missing business facts
- Discovery queue states, system version, and capacity
- Readiness object keys rendered in monospace
- Validation run id, `products=`, `diversity=`, and `PAUSED_BY_OPERATOR`
- Notices that describe HTTP 404 and route templates

The visitor site does not show these tokens. Public pages stay in that state.

## Missing business information

The operator cannot see, in one place:

- A market search: keyword, country, language, device, sponsored results, organic results
- Landing pages collected from that search, with final URL and whether HTML was obtained
- Observed product name, brand, category, and price, including an explicit empty state when a field was not on the page
- Opportunity rank, portfolio, and recommendation
- A paused Google Ads draft: campaign, ad group, and responsive search ad, with a clear statement that nothing was sent
- Optimization: performance, recommendation, and pending actions that still require approval
- Which credential or account is missing, in business language, without showing secret values

Product evidence is a download route, `/admin/product-evidence/[campaignId]`, not a screen.

## Page hierarchy

```text
Visitor (English, public)
  Home
  Reviews
  Review page /p/[slug]
  About
  Editorial Policy
  Affiliate Disclosure
  Privacy
  Terms
  Contact

Operator (Portuguese, authenticated)
  Dashboard
  Pesquisa de Mercado
    Nova pesquisa
    Resultado da pesquisa
    Páginas coletadas
  Produtos
    Produtos observados
    Análise do produto
    Editor do produto
    Saúde do produto
  Oportunidades
    Ranking
    Portfólio
    Recomendação
  Campanhas
    Lista
    Workspace da campanha
      Presell
      Rascunho Google Ads
    Publicação da presell
  Relatórios
    Desempenho da presell
    Transações
    Otimização
  Configurações
    Sessão
    Prontidão
    Discovery
    Laboratório
```

Diagnostic routes stay under Configurações or inside the campaign workspace. They are not primary navigation: Validation Lab, visual frames, and the slug aliases of the LP tools.

## Screen relationships

```text
Dashboard
  → Pesquisa de Mercado → Resultado → Páginas coletadas
  → Produtos observados → Análise do produto
  → Oportunidades (ranking, portfólio, recomendação)
  → Campanhas → Workspace → Publicação da presell
  → Relatórios → Otimização

Resultado da pesquisa
  → Escolher produto → Análise do produto
Análise do produto
  → Gerar campanha → Workspace
Workspace
  → Rascunho Google Ads
  → Relatórios de desempenho
  → Otimização (métricas e ações pendentes)
```

A campaign workspace is the only place that edits a presell. Google Ads remains a paused draft until a later, explicit publish decision. Optimization reads performance and proposes actions. It does not apply them.

## Where current routes move

| Current route | Target place |
| --- | --- |
| `/admin` | Campanhas / Lista |
| `/admin/new`, `/admin/generate`, `/admin/[id]/edit` | Campanhas / Workspace |
| `/admin/lp-builder`, `lp-visual`, `lp-media`, `lp-layout`, `lp-versions` and their slug aliases | Campanhas / Workspace / Presell |
| `/admin/preview/[slug]`, `/preview/[slug]/[candidate]`, visual frames | Campanhas / Workspace / Presell, as preview |
| `/admin/[id]/publish`, `/admin/[id]/lint` | Campanhas / Publicação da presell |
| `/admin/product-editor/[campaignId]` | Produtos / Editor |
| `/admin/product-health/[campaignId]` | Produtos / Saúde |
| `/admin/[id]/analytics`, `/admin/transactions` | Relatórios |
| `/admin/discovery/*` | Configurações / Discovery |
| `/admin/system/readiness` | Configurações / Prontidão |
| `/admin/validation/*` | Configurações / Laboratório |
| `/admin/login` | Configurações / Sessão |
| `/`, `/reviews`, `/p/[slug]`, legal pages | Visitor site, unchanged |

Search, observed products from a live search, opportunity ranking, Google Ads drafts, and optimization have no current route. They are new screens in this architecture only.

## Target screens

### Dashboard

Purpose: show what needs the operator next, in business language.
Primary action: continuar a tarefa mais recente.
Secondary actions: nova pesquisa, abrir campanhas, abrir relatórios.
Expected inputs: none.
Expected outputs: contagem de pesquisas recentes, produtos observados, oportunidades em aberto, campanhas em rascunho, ações de otimização aguardando aprovação.
Required components: resumo, lista de próximos passos, atalhos para as sete áreas.

### Pesquisa de Mercado

Purpose: registrar uma busca real e guardar o que a SERP devolveu.
Primary action: pesquisar.
Secondary actions: repetir a última busca, abrir páginas coletadas, escolher um produto.
Expected inputs: palavra-chave, país, idioma, dispositivo.
Expected outputs: resultados patrocinados, resultados orgânicos, tempo de execução, páginas coletadas com URL final.
Required components: formulário de busca, lista patrocinada, lista orgânica, estado vazio quando não houver anúncio https.

### Produtos

Purpose: mostrar o que as páginas sustentam sobre cada produto.
Primary action: analisar o produto escolhido.
Secondary actions: abrir editor, abrir saúde, gerar campanha.
Expected inputs: produto escolhido a partir da pesquisa, ou campanha já existente.
Expected outputs: nome, marca, categoria, preço, e a evidência de cada um. Campo ausente permanece ausente.
Required components: ficha observada, grafo de evidência em linguagem de negócio, editor, saúde.

### Oportunidades

Purpose: ordenar o que a pesquisa sustenta e dizer o que fazer a seguir.
Primary action: abrir a oportunidade recomendada.
Secondary actions: ver portfólio, ver a recomendação e a evidência.
Expected inputs: relatório de mercado já gerado.
Expected outputs: posição, agrupamento por idioma e país observados, tipo de recomendação.
Required components: ranking, portfólio, recomendação com evidência.

### Campanhas

Purpose: preparar a presell e o rascunho pausado no Google Ads.
Primary action: gerar a campanha a partir do produto analisado.
Secondary actions: editar a presell, ver prévia, revisar o rascunho do anúncio, pedir publicação da presell.
Expected inputs: produto analisado, textos e URLs já sustentados.
Expected outputs: campanha em rascunho, presell ainda não pública, rascunho pausado de campanha, grupo e anúncio.
Required components: lista, workspace, prévia, checklist de publicação da presell, painel do rascunho Google Ads.

### Relatórios

Purpose: ler o que aconteceu depois da publicação e o que a otimização propõe.
Primary action: revisar a ação pendente.
Secondary actions: filtrar período, abrir transações, voltar à campanha.
Expected inputs: campanha publicada ou rascunho já sincronizado, período.
Expected outputs: visitas e comércio da presell, métricas, recomendação, ações que ainda exigem aprovação.
Required components: desempenho da presell, transações, painel de otimização com estado pendente.

### Configurações

Purpose: sessão, prontidão e ferramentas de diagnóstico.
Primary action: sair, ou corrigir o item de prontidão que bloqueia o trabalho.
Secondary actions: abrir fontes de discovery, abrir laboratório.
Expected inputs: credenciais já configuradas fora da tela. A tela não pede nem mostra segredos.
Expected outputs: o que está pronto e o que falta, em linguagem de negócio.
Required components: sessão, prontidão, discovery, laboratório.
