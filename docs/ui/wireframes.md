# Low-Fidelity Wireframes

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 02
Ruleset: UI_UX_GLOBAL_RULES_V1

Documentation only. These blocks are not screens, components, or styles.

Shared rules:

- Simple blocks. No color, no icon, no CSS.
- The operator sees business language.
- Identifiers, codes, paths, and raw counters stay inside "Ver detalhes técnicos".
- One primary action per screen. The sidebar does not change.
- The public site is not in this console.

## Shared chrome

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
|                  | Inicio > [area] > [tela]                      |
| Dashboard        +-----------------------------------------------+
| Pesquisa         |                                               |
| Produtos         |                                               |
| Oportunidades    |              conteudo da tela                 |
| Campanhas        |                                               |
| Relatorios       |                                               |
| Configuracoes    |                                               |
|                  |                                               |
+------------------+-----------------------------------------------+
```

Header: nome da plataforma, nome do operador, link Conta.
Sidebar: as sete areas, nesta ordem. A area atual fica marcada com texto "(atual)".
Breadcrumb: Inicio, area, tela.
Conta abre Configuracoes > Sessao. Sair fica la, nao na sidebar.

## Screen index

| Screen | Document |
| --- | --- |
| Dashboard | docs/ui/dashboard-wireframe.md |
| Pesquisa de Mercado, Resultado da Pesquisa | docs/ui/market-search-wireframe.md |
| Detalhes do Produto, Landing Page Viewer, Oportunidade, Analise | docs/ui/product-wireframe.md |
| Campanhas, Detalhes da Campanha, Google Ads | docs/ui/campaign-wireframe.md |
| Relatorios, Monitoramento | docs/ui/reports-wireframe.md |
| Configuracoes | docs/ui/settings-wireframe.md |

## Complete journey

```text
[Dashboard]
    primary: Continuar  |  vazio: Pesquisar mercado
        |
        v
[Pesquisar Mercado]
    primary: Pesquisar
        |
        v
[Resultado da Pesquisa]
    primary: Ver paginas coletadas
        |
        v
[Detalhes do Produto]
    primary: Ver pagina de destino
        |
        v
[Landing Page Viewer]
    primary: Seguir para analise
        |
        v
[Analise]
    primary: Criar campanha
    apoio: [Oportunidade] ranking, portfolio, recomendacao
        |
        v
[Detalhes da Campanha]
    primary: Revisar rascunho do anuncio
        |
        v
[Google Ads]
    tres rascunhos pausados
    primary: Concluir revisao
    nada e enviado
        |
        v
[Monitoramento]
    dentro de Relatorios
    primary: Revisar acao pendente
    a acao nao e executada
```

Atalhos fora da jornada: Campanhas abre a lista. Produtos abre um produto ja guardado. Relatorios abre o monitoramento de uma campanha existente. Configuracoes nao entra na jornada.

## UX review

| Screen | Purpose | Primary action | Next action | Critical | Hidden |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Mostrar o trabalho em aberto | Continuar | A tela da tarefa | O que falta decidir | Ids, slugs, codigos |
| Pesquisa de Mercado | Pedir uma busca | Pesquisar | Resultado | Palavra, pais, idioma, dispositivo | Chave, pedido, provedor |
| Resultado da Pesquisa | Ler a busca | Ver paginas | Produto | Patrocinado, organico, tempo | URL crua, marcadores |
| Detalhes do Produto | Ver o que a pagina sustenta | Ver pagina | Landing page | Nome, marca, categoria, preco | Ids de no, grafo cru |
| Landing Page Viewer | Ver a pagina coletada | Seguir para analise | Analise | Abriu, endereco final, conteudo legivel | HTTP, bytes, redirects numericos |
| Oportunidade | Ordenar e recomendar | Abrir a recomendada | Analise ou produto | Posicao e recomendacao | Formula, pontuacao interna |
| Analise | Decidir se vira campanha | Criar campanha | Detalhes da campanha | O que sustenta e o que falta | Gate codes |
| Campanhas | Achar uma campanha | Abrir campanha | Detalhes | Nome, estado, proximo passo | Slug, id, doze atalhos |
| Detalhes da Campanha | Preparar a presell | Revisar anuncio | Google Ads | Rascunho e o que falta publicar a presell | Rotas, aliases |
| Google Ads | Revisar rascunhos pausados | Concluir revisao | Monitoramento | Pausado e nao enviado | Resource names, tokens |
| Relatorios | Ler resultado e pendencias | Revisar acao pendente | Permanece pendente | Desempenho e acao por aprovar | Queries, micros |
| Configuracoes | Conta e prontidao | Resolver o que falta | Voltar ao trabalho | Pronto ou faltando, sem segredo | Chaves, fila, versao |

WIREFRAMES=READY
USER_FLOW=READY
UX_REVIEW=READY
