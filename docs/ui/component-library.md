# Component Library

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 03

Especificação. Não há implementação.

Medidas remetem a docs/ui/design-system.md. Cores remetem a docs/ui/color-palette.md. Tipo remete a docs/ui/typography.md.

Cada controle tem rótulo visível. Placeholder não substitui rótulo. Foco visível em todos.

## Primary Button

Fundo Primary, texto branco, radius-s, padding 10 px por 16 px, tipo Button.
Por que existe: a única ação que avança a jornada.
Quando usar: uma vez por tela. Exemplos: Pesquisar, Continuar, Criar campanha, Concluir revisão, Revisar ação pendente.
Valor de negócio: o próximo passo é óbvio.
Não usar para publicar o Ad. Esta fase não desenha envio ao Google Ads.

## Secondary Button

Fundo Secondary, texto Text, borda Border strong, mesmo tamanho do primário.
Por que existe: a alternativa que não avança.
Quando usar: Voltar, Salvar presell, Abrir.
Valor de negócio: a pessoa corrige ou olha outro bloco sem disparar a decisão.

Botão desabilitado: fundo #F0F2F5, texto #8B95A3, sem sombra. O motivo fica em Body ao lado, por exemplo "Criar campanha fica indisponível: preço não observado." A cor sozinha não explica.

## Input

Altura 40 px, radius-s, borda Border strong, fundo Surface, padding horizontal 12 px.
Rótulo Caption acima, em Text. Erro em Danger, abaixo, uma frase.
Por que existe: recolher um fato que o operador informa.
Quando usar: nome editável e campos que não são Keyword, Headline ou Description.
Valor de negócio: o que a pessoa digitou fica separado do que a página observou.

## Select

Mesma caixa do Input, com indicação textual "Abrir" à direita. Lista em superfície nível 1.
Por que existe: escolher um conjunto fechado.
Quando usar: país, idioma, dispositivo, período.
Valor de negócio: a busca e o relatório não aceitam valor livre nesses eixos.

## Search Bar

Input com o rótulo "Buscar" e o atalho de teclado mostrado em Caption.
Por que existe: achar uma linha numa lista longa.
Quando usar: Campanhas, Relatórios, Products. Não substitui o formulário de Pesquisa de Mercado.
Valor de negócio: a pessoa volta a uma campanha sem percorrer a jornada de novo.

## Card

Surface, borda Border, radius-m, padding space-4, elevação 0.
Por que existe: agrupar uma decisão.
Quando usar: bloco de página, recomendação, rascunho de anúncio.
Valor de negócio: campanha, grupo e anúncio pausados aparecem como três decisões, não como um formulário técnico.

## Metric Card

Card com Caption no assunto, Metric no número, Caption opcional no período.
Por que existe: mostrar o número que muda a decisão.
Quando usar: Dashboard e Desempenho. Máximo de quatro.
Valor de negócio: visitas, cliques no botão e compras aparecem antes do gráfico.

## Table

Cabeçalho Caption em Muted text, célula Table, linha de 44 px, divisória Border.
Linha inteira é clicável e leva ao detalhe. Hover: fundo #F6F7F9. Seleção: borda esquerda 2 px Primary.
Por que existe: comparar objetos iguais.
Quando usar: pesquisas, anúncios, campanhas, transações, ações pendentes.
Valor de negócio: nome, estado e próximo passo. Identificador fica fora da coluna.

Paginação fica abaixo, alinhada ao fim.

## Badge

Pill, Caption 12 px peso 500, padding 4 px por 8 px, ponto de 8 px, pares de docs/ui/color-palette.md.
Por que existe: dizer a situação em linguagem de negócio.
Quando usar: um por linha ou no topo do detalhe.
Valor de negócio: Pronto, Atenção, Revisar, Bloqueado, Em análise, Excelente.

## Progress

Barra de 4 px de altura, trilho #E4E7EC, preenchimento Info. Rótulo em Caption: "Em análise" mais a etapa em palavras.
Por que existe: mostrar que a busca ou a leitura ainda corre.
Quando usar: pesquisa em curso e leitura de relatório. Não usar para completude percentual.
Valor de negócio: a pessoa espera a etapa, não um código de fila.

## Tabs

Texto Body, aba ativa com sublinhado 2 px Primary e peso 600. Sem caixa em volta.
Por que existe: trocar o miolo sem sair do objeto.
Quando usar: Presell, Ad, Publicação na campanha. Desempenho, Transações, Otimização no relatório. Sessão, Prontidão, Fontes, Laboratório nas configurações.
Valor de negócio: a presell e o anúncio são partes da mesma campanha.

Rótulos das abas em pt-BR. O conteúdo de Headline, Description e Ad, dentro da aba, permanece em inglês.

## Modal

Superfície radius-l, elevação 2, largura 480 px, padding space-6. Fundo da página escurecido a 40% de #1C2430.
Título H2. Uma frase Body. Primary Button e Secondary Button à direita.
Por que existe: confirmar uma decisão difícil de desfazer.
Quando usar: publicar a presell, sair com alteração não salva. Não usar para revisar o Ad.
Valor de negócio: publicar a página é explícito e separado de enviar anúncio.

Foco entra no título e fica preso até fechar. Esc fecha. O botão que abriu recupera o foco.

## Drawer

Painel à direita, 400 px, elevação 2, o resto da página permanece visível.
Por que existe: ler um complemento sem perder a lista.
Quando usar: "Ver detalhes técnicos" e o motivo de uma ação pendente.
Valor de negócio: o detalhe técnico existe, e não ocupa a decisão.

## Tooltip

Superfície nível 1, Caption, atraso de 400 ms, no foco e no hover.
Por que existe: explicar um termo curto.
Quando usar: palavra de métrica que cabe numa frase. Não usar para erro nem para o que o badge já diz.
Valor de negócio: "Cliques no botão" não precisa de um parágrafo na tabela.

## Toast

Faixa Surface, borda Border, elevação 2, canto inferior direito, some em 6 s. Erro permanece até fechar.
Texto Body. Sem código.
Por que existe: confirmar que a ação terminou.
Quando usar: presell salva, revisão concluída, falha de busca.
Valor de negócio: a pessoa sabe se pode seguir, sem um alerta no meio da tabela.

## Accordion

Cabeçalho Body strong, painel fechado por padrão, conteúdo Body.
Por que existe: guardar o que não é a decisão.
Quando usar: somente "Ver detalhes técnicos", Fontes e Laboratório.
Valor de negócio: a prontidão e a campanha continuam legíveis.

## Breadcrumb

Caption, separador ">", último item em Text e sem link.
Por que existe: dizer o caminho e permitir voltar um nível.
Quando usar: toda tela interna. Dashboard mostra só "Início".
Valor de negócio: de um Product dá para voltar à pesquisa sem usar o histórico do navegador.

## Pagination

Caption "Página 1 de N", Secondary Buttons "Anterior" e "Próxima".
Por que existe: lista longa sem alongar a página.
Quando usar: campanhas, transações, pesquisas recentes, acima de 20 linhas.
Valor de negócio: a comparação continua estável.

## Forms, no conjunto

Empilhar rótulo, campo, ajuda, erro. Espaço space-3 entre campos e space-5 antes da ação.
Keyword, Headline e Description são campos de conteúdo em inglês: o rótulo é a palavra inglesa, o valor não é traduzido.
País, idioma, dispositivo e período são Select.
Por que existe: a busca pede pouco e devolve muito.
Quando usar: Pesquisa de Mercado e a edição da presell.
Valor de negócio: o operador não mistura o que digitou com o que a página mostrou.

## Navigation

Ver docs/ui/visual-guidelines.md e docs/ui/iconography.md.

Header fixo, 56 px, Surface, borda inferior Border. Marca à esquerda. Nome do operador e "Conta" à direita.
Sidebar 240 px, fundo Background, item Body, item atual com fundo Surface, borda radius-m e texto Primary.
Por que existe: as sete áreas ficam estáveis enquanto a tarefa muda.
Quando usar: todo o console autenticado.
Valor de negócio: Pesquisa, Products, Oportunidades, Campanhas, Relatórios e Configurações não se misturam.
