# Navigation Map

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 01

## Current operator navigation

Present on every admin page:

- Início → `/`
- Lista → `/admin`
- Transações → `/admin/transactions`
- Readiness → `/admin/system/readiness`
- Validation → `/admin/validation`
- Discovery → `/admin/discovery`
- Sair

The campaign list adds Gerar com IA, Validation Lab, and Nova campanha. Each campaign then adds its own row of tools. Discovery adds Health, Sources, Queue, and Scheduler on the discovery pages only.

There is no item for market search, products as a catalog, opportunities, Google Ads, or optimization.

## Current visitor navigation

Primary: Home `/`, Reviews `/reviews`, About `/about`, Editorial Policy `/editorial-policy`.

Policies: Affiliate Disclosure `/affiliate-disclosure`, Privacy `/privacy`, Terms `/terms`, Contact `/contact`.

The published review is `/p/[slug]`. It is not a console item.

## Target main navigation

Operator only. Seven items, in this order.

1. Dashboard
2. Pesquisa de Mercado
3. Produtos
4. Oportunidades
5. Campanhas
6. Relatórios
7. Configurações

Sair fica na conta, dentro de Configurações, não como um destino de trabalho.

O site público não entra nesta navegação. O operador abre a presell publicada a partir da campanha, como visualização, sem misturar o menu do visitante com o menu de operação.

## Dashboard

Destino: visão do trabalho em aberto.

Filhos:

- Continuar pesquisa recente
- Continuar produto em análise
- Continuar campanha em rascunho
- Ações de otimização aguardando aprovação

## Pesquisa de Mercado

Destino: buscar e ler a SERP.

Filhos:

- Nova pesquisa
- Resultado da pesquisa
- Páginas coletadas

Não lista editores de presell.

## Produtos

Destino: o que foi observado e o que já está numa campanha.

Filhos:

- Produtos observados
- Análise do produto
- Editor do produto
- Saúde do produto

O editor e a saúde atuais (`/admin/product-editor/[campaignId]`, `/admin/product-health/[campaignId]`) passam a abrir daqui. A evidência deixa de ser só um download.

## Oportunidades

Destino: ranking, portfólio e recomendação da pesquisa.

Filhos:

- Ranking
- Portfólio
- Recomendação

Uma oportunidade abre a análise do produto e, em seguida, a geração da campanha.

## Campanhas

Destino: presell e rascunho Google Ads.

Filhos:

- Lista (hoje `/admin`)
- Nova campanha (hoje `/admin/new` e `/admin/generate`)
- Workspace
  - Presell: LP Builder, Visual, Media, Layout, History, preview
  - Rascunho Google Ads: campanha pausada, grupo pausado, anúncio pausado
- Publicação da presell (hoje Policy Check e Publish)

Os pares `/admin/lp-*/slug/[slug]` não ganham item próprio. São o mesmo workspace.

## Relatórios

Destino: resultado e otimização.

Filhos:

- Desempenho da presell (hoje `/admin/[id]/analytics`)
- Transações (hoje `/admin/transactions`)
- Otimização: métricas, desempenho, recomendações, ações pendentes

## Configurações

Destino: conta e diagnóstico.

Filhos:

- Sessão (hoje `/admin/login` e Sair)
- Prontidão (hoje `/admin/system/readiness`)
- Discovery: painel, fontes, fila, agenda, saúde
- Laboratório: validation runs, compare, candidate preview, visual frames

## Relationship map

```text
[Dashboard]
    | Pesquisa de Mercado
    |-- Nova pesquisa
    |-- Resultado -------- Escolher produto --+
    |-- Páginas coletadas                     |
    |                                         v
    | Produtos                          [Análise]
    |-- Observados                            |
    |-- Editor                                | Gerar campanha
    |-- Saúde                                 v
    |                                   [Workspace]
    | Oportunidades                         /    \
    |-- Ranking                    [Presell]   [Rascunho Google Ads]
    |-- Portfólio                      |
    |-- Recomendação                   v
    |                            [Publicação da presell]
    | Relatórios                         |
    |-- Desempenho <---------------------+
    |-- Transações
    |-- Otimização ---- ação pendente (não executa)
    |
    | Configurações
      Sessão, Prontidão, Discovery, Laboratório
```

## Rules for the map

- Um item principal, uma tarefa. Pesquisa não edita anúncio. Relatórios não criam campanha. Configurações não escolhem produto.
- Google Ads aparece dentro da campanha, como rascunho pausado. Não é um oitavo item.
- Monitoramento é Relatórios, não uma tela solta no fim do fluxo.
- O visitante continua em Home, Reviews e na presell. Esse mapa não altera o site público.
