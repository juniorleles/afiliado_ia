# UX Validation Report

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 04

Protótipo em `/prototype`. Dados simulados. Sem backend.

## O que foi verificado

As dez rotas responderam 200:

- `/prototype`
- `/prototype/pesquisa`
- `/prototype/pesquisa/resultado`
- `/prototype/produto`
- `/prototype/produto/landing-page`
- `/prototype/oportunidade`
- `/prototype/campanhas`
- `/prototype/campanhas/joint-pain-test`
- `/prototype/relatorios`
- `/prototype/configuracoes`

No desktop, a jornada clicada foi:

1. Continuar, no Dashboard
2. Ver Product, no resultado
3. Criar campanha, no Product

A terceira tela foi Joint Pain Test. A aba Ad mostrou Headlines e Descriptions em inglês, com o texto "Nada foi enviado." Concluir revisão abriu Relatórios. Ver detalhes técnicos abre fechado e expande sob demanda.

No celular, a sidebar some e o botão Menu abre as sete áreas. Dashboard, a partir do menu, voltou ao início e fechou o menu. Abaixo de 1280 px o tablet usa o mesmo menu.

Qualquer área principal está a um clique pela sidebar ou pelo menu. O caminho Dashboard, resultado, Product, campanha cabe em três cliques.

## Known UX problems

- O idioma do documento continua inglês, porque a raiz do site é compartilhada com a presell pública. O bloco do protótipo declara pt-BR, mas o elemento html não muda.
- O botão Pesquisar sempre abre o mesmo resultado, mesmo se a Keyword for editada.
- No Product, a ação primária é Ver Landing page. Criar campanha é secundária. O atalho de três cliques usa a ação secundária.
- Tablet e celular compartilham o menu. Não há sidebar só de ícones entre 768 e 1279 px.
- Os números de Relatórios e a transação são simulados. A faixa do topo diz isso, e ainda pode ser lida como resultado real se a faixa for ignorada.

## Improvement suggestions

- Quando a Landing page já foi vista, a ação primária do Product pode passar a ser Criar campanha.
- Se a Keyword digitada não for a do exemplo, o resultado deve dizer que o protótipo só tem esse caso, em vez de mostrar Dynamic Joint sem aviso.
- Entre 768 e 1279 px, uma sidebar estreita com ícone e nome no foco reduz um toque para trocar de área.
- Separar o protótipo da raiz pública quando for possível declarar html lang pt-BR sem alterar o site do visitante.
- Trocar a faixa fixa por um rótulo menor depois que a pessoa já viu que os dados são simulados, para ela não competir com o título.
