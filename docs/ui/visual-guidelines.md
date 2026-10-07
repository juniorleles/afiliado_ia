# Visual Guidelines

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 03

Como aplicar o sistema nas telas já definidas nos wireframes. Continua sendo especificação.

## Tom visual

Fundo Background, trabalho em Surface, uma ação Primary. Parece um console de operação: pouco enfeite, tabela legível, estado em palavra.

A presell pública não usa este tema. O console não usa o verde do admin antigo.

## Idioma na tela

pt-BR em navegação, botões, badges, erros, estados vazios e ajuda.

Em inglês, rótulo e conteúdo:

- Landing page
- Headline
- Description
- Ad
- Keyword
- Product
- Creative asset

Exemplo de linha: badge "Revisar", nome do Product em inglês como foi observado, próximo passo "Ver Landing page".

Não traduzir Headline, Description ou Keyword observados. Não inventar Product, marca, categoria ou preço.

## Navegação

Ordem da sidebar: Dashboard, Pesquisa, Products, Oportunidades, Campanhas, Relatórios, Configurações.
Item atual: fundo Surface, texto Primary, ícone Primary.
Header: marca, operador, Conta. Sair fica em Configurações, seção Sessão.
Breadcrumb em toda tela interna.

Por que existe: a jornada e o atalho convivem.
Quando usar: sempre no console.
Valor de negócio: dá para seguir Pesquisa até Monitoramento e também abrir uma campanha já existente.

Tela estreita: a sidebar fecha e abre pelo botão "Menu" no header. O drawer de navegação é o de docs/ui/component-library.md.

## Empty States

Bloco central, H2, uma frase Body, um Secondary ou Primary Button. Sem ilustração.

| Tela | Título | Frase | Ação |
| --- | --- | --- | --- |
| Dashboard | Nenhum trabalho em aberto | Quando houver uma pesquisa ou um rascunho, ele aparece aqui. | Pesquisar |
| Pesquisa | Nenhuma pesquisa recente | A primeira busca pede Keyword, país, idioma e dispositivo. | O formulário já está na tela |
| Resultado | Nenhuma Landing page | Não há endereço https de Ad para coletar. O resultado orgânico permanece na lista. | Voltar à pesquisa |
| Products | Nenhum Product observado | A busca ainda não trouxe nome de Product. | Voltar ao resultado |
| Campanhas | Nenhuma campanha | Uma campanha nasce de um Product analisado. | Ir para Products |
| Relatórios | Sem desempenho | Não há leitura para esta campanha. A frase diz se falta a conta de anúncios ou se o Ad não foi enviado. | Voltar à campanha |
| Configurações | Tudo pronto | Busca, conta de anúncios e publicação da presell estão prontas. | Voltar ao Dashboard |

Por que existe: o vazio é uma resposta, não uma falha muda.
Quando usar: lista sem linha e métrica sem leitura.
Valor de negócio: a pessoa sabe o que fazer em seguida e o que não foi inventado.

## Loading States

A página mantém header, sidebar e H1. O miolo mostra três barras de 12 px em #E4E7EC no lugar dos cards, e cinco linhas no lugar da tabela. Progress "Em análise" quando a busca ou a leitura está em curso.
Não mostrar spinner solto no centro sem o título da tela.

Por que existe: a espera tem contexto.
Quando usar: pesquisa, coleta de Landing page, leitura de relatório.
Valor de negócio: "Em análise" distingue espera de lista vazia.

## Notifications

Toast para conclusão e falha curta.
Modal só para publicar a presell ou descartar edição.
Drawer para "Ver detalhes técnicos" e para o motivo da ação pendente.
Badge para o estado duradouro do objeto.

Frases:

- Sucesso: "Presell salva." "Revisão concluída. Nada foi enviado."
- Falha: "A pesquisa não concluiu. Tente de novo."
- Bloqueio: "Criar campanha está indisponível: o preço não foi observado."

Por que existe: separar aviso passageiro, confirmação grave e detalhe.
Quando usar: como acima. Não empilhar toast.
Valor de negócio: a pessoa não confunde salvar a presell com enviar o Ad.

## Charts

Um gráfico por aba Desempenho. Três séries no máximo, cores de docs/ui/color-palette.md, legenda em texto, grade Border. Sem número de exemplo no desenho. Se não houver leitura, vale o empty state, não um gráfico zerado decorativo.

Por que existe: ver o período junto dos metric cards.
Quando usar: Relatórios, aba Desempenho.
Valor de negócio: visitas, cliques no botão e compras no tempo.

## Tables e cards na jornada

A tabela responde "qual objeto". O card responde "qual decisão". Não repetir as mesmas colunas nos dois.

Campanhas, em tabela: nome, badge, próximo passo.
Google Ads, em três cards: Campanha pausada, Grupo pausado, Ad pausado, mais a frase "Nada foi enviado."

## Acessibilidade

WCAG AA.

- Texto e botão Primary nos contrastes de docs/ui/color-palette.md.
- Estado não depende só da cor: o badge tem palavra.
- Foco visível, anel Info de 2 px.
- Ordem de tabulação: menu, breadcrumb, H1, ação primária, conteúdo, detalhes técnicos.
- Modal prende o foco. Esc fecha menu, drawer e modal.
- Ícone da sidebar tem nome visível ou tooltip quando recolhido.
- Alvo de clique mínimo 40 px na linha e no botão.
- Tipo responsivo: H1 pode ir a 24 px. Body permanece 14 px.
- Respeitar redução de movimento.
- Erro de campo ligado ao Input pelo rótulo, não só pela cor.

Por que existe: a decisão continua possível por teclado e sem depender da cor.
Quando usar: em todo controle deste sistema.
Valor de negócio: um media buyer opera a lista e a ação primária sem mouse.

## Fora desta especificação

Não desenhar envio de Ad, pause, resume nem mudança de orçamento.
Não mostrar segredo, token, id, slug ou resource name fora de "Ver detalhes técnicos".
Não aplicar este tema à presell pública.
