# Design System

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 03
Ruleset: UI_UX_GLOBAL_RULES_V1

Especificação visual. Não há componente, folha de estilo nem tela implementada neste documento.

O sistema vale para o console do operador. A presell pública continua no padrão visual já existente para o visitante em inglês. Este documento não redesenha `/p/[slug]`.

## Para quem é

Afiliados, gestores de Google Ads, media buyers e profissionais de growth. A tela ajuda a decidir o próximo passo de negócio. Detalhe técnico fica fechado em "Ver detalhes técnicos".

## Referência de qualidade

A densidade e a calma vêm de Linear, Vercel Dashboard, Stripe Dashboard e Notion. A leitura de tabela e de métrica vem de Google Ads, Ahrefs e Semrush. Nada aqui copia marca, layout ou componente desses produtos.

## Princípios

1. Uma ação primária por tela.
2. Superfície branca, borda fina, sombra só quando algo flutua.
3. Cor comunica estado de decisão, não decoração.
4. Número e nome de negócio aparecem antes de identificador.
5. O que não foi observado aparece como "Não observado". A interface não completa o vazio.

## Idioma

A interface é português (pt-BR).

Estes objetos permanecem em inglês, no rótulo e no conteúdo:

- Landing page
- Headline
- Description
- Ad
- Keyword
- Product
- Creative asset

O menu usa Products nesse item. As outras áreas seguem a arquitetura: Dashboard, Pesquisa, Oportunidades, Campanhas, Relatórios, Configurações.

## Mapa dos documentos

| Assunto | Arquivo |
| --- | --- |
| Cor | docs/ui/color-palette.md |
| Tipo | docs/ui/typography.md |
| Componentes | docs/ui/component-library.md |
| Ícones | docs/ui/iconography.md |
| Aplicação, estados vazios, carga, aviso, acesso | docs/ui/visual-guidelines.md |

## Espaçamento

Base de 4 px.

| Token | Valor | Uso |
| --- | --- | --- |
| space-1 | 4 | Ícone e rótulo |
| space-2 | 8 | Dentro de badge e célula |
| space-3 | 12 | Entre campos de uma linha |
| space-4 | 16 | Padding de card e de página em tela estreita |
| space-5 | 24 | Entre blocos |
| space-6 | 32 | Padding da página |
| space-7 | 48 | Seção |
| space-8 | 64 | Respiro do estado vazio |

Por que existe: o ritmo é previsível em tabela e formulário.
Quando usar: todo intervalo visível usa um token. Não há medida solta.
Valor de negócio: o operador acha a ação e o número sem varrer um bloco compacto demais.

## Raio

| Token | Valor | Uso |
| --- | --- | --- |
| radius-s | 6 px | Botão, campo, badge |
| radius-m | 8 px | Card, menu, linha de tabela selecionada |
| radius-l | 12 px | Modal e drawer |
| radius-pill | 999 px | Badge de status |

Por que existe: cantos curtos aproximam o console de uma ferramenta, não de um cartaz.
Quando usar: o token da tabela acima. Nada acima de 12 px, fora o pill do badge.
Valor de negócio: a hierarquia fica no conteúdo, não no formato do bloco.

## Elevação

| Nível | Tratamento | Uso |
| --- | --- | --- |
| 0 | Sem sombra, borda 1 px | Página, card, tabela, campo |
| 1 | Sombra curta, 8 px de desfoque, 8% de preto | Menu, tooltip |
| 2 | Sombra média, 24 px de desfoque, 12% de preto | Modal, drawer, toast |

Por que existe: profundidade só marca o que está acima da tarefa.
Quando usar: nível 0 no trabalho. Nível 1 no que abre e fecha. Nível 2 no que pede decisão.
Valor de negócio: o card de métrica não compete com o modal de confirmação.

## Grade

Largura mínima útil: 1280 px no console. Abaixo disso a sidebar vira drawer e a tabela rola na horizontal.
Sidebar: 240 px. Conteúdo: o restante, com padding space-6.
Colunas de métrica: até 4, com space-5 entre elas.

## Foco e movimento

Foco visível: anel de 2 px na cor Info, afastado 2 px do controle.
Transição: 150 ms na cor de fundo do botão e na abertura de menu. Sem animação de entrada de página.
Movimento respeita a preferência de reduzir animação: nesse caso, menu, modal e toast aparecem sem deslizar.
