# Navigation Flow

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 04

O protótipo está em `/prototype`. Não chama backend, API nem banco. Os dados são simulados.

## Áreas em um clique

A sidebar, no desktop, e o menu, no tablet e no celular, ligam direto a:

| Área | Rota |
| --- | --- |
| Dashboard | `/prototype` |
| Pesquisa | `/prototype/pesquisa` |
| Products | `/prototype/produto` |
| Oportunidades | `/prototype/oportunidade` |
| Campanhas | `/prototype/campanhas` |
| Relatórios | `/prototype/relatorios` |
| Configurações | `/prototype/configuracoes` |

Conta, no topo, abre Configurações. Plataforma, no topo, volta ao Dashboard.

## Jornada pelos botões primários

```text
Dashboard
  Continuar
    → /prototype/pesquisa/resultado
Resultado
  Ver Product
    → /prototype/produto
Product
  Ver Landing page
    → /prototype/produto/landing-page
Landing page
  Seguir para a oportunidade
    → /prototype/oportunidade
Oportunidade
  Criar campanha
    → /prototype/campanhas/joint-pain-test
Campanha
  Concluir revisão
    → /prototype/relatorios
```

Atalho de três cliques, a partir do Dashboard, até a campanha:

1. Continuar
2. Ver Product
3. Criar campanha

Relatórios continua a um clique pela sidebar ou por Concluir revisão.

## Breadcrumb

Cada tela interna tem trilha clicável. O último item não é link. Início volta ao Dashboard. Pesquisa de Mercado volta ao formulário. Campanhas volta à lista. Products volta ao Product.

## O que não navega para fora

Pesquisar só abre o resultado simulado. Sair não encerra sessão. Publicar a presell e enviar o Ad não existem como ação.
