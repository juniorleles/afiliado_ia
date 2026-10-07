# Color Palette

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 03

Tema claro. Texto escuro sobre superfície branca. A cor de ação é índigo. A cor de estado nunca é o único sinal: o badge leva texto.

Contraste citado abaixo é texto sobre o fundo indicado, alvo WCAG AA (4,5:1 para texto, 3:1 para componente e borda relevante).

## Papéis

| Papel | Hex | Sobre | Uso |
| --- | --- | --- | --- |
| Primary | #2F3CC9 | Texto branco #FFFFFF, acima de 4,5:1 | Ação primária |
| Primary press | #2430A8 | Texto branco | Botão pressionado |
| Secondary | #EEF0F8 | Texto #1C2430 | Ação secundária |
| Success | #0B6B42 | Fundo #E7F6EF | Pronto, excelente |
| Warning | #8A5A00 | Fundo #FFF6E0 | Atenção |
| Review | #9A3412 | Fundo #FFEDD5 | Revisar |
| Danger | #B42318 | Fundo #FDECEC | Bloqueado |
| Info | #175CD3 | Fundo #E8F1FC | Em análise, foco |
| Background | #F6F7F9 | Texto #1C2430 | Fundo da aplicação |
| Surface | #FFFFFF | Texto #1C2430 | Card, tabela, campo, header |
| Border | #E4E7EC | — | Divisão. Contraste de componente com o fundo da página acima de 3:1 não é exigido para divisória decorativa; borda de campo usa Border strong |
| Border strong | #C5CDD8 | — | Campo, tabela, foco em repouso |
| Text | #1C2430 | Sobre Surface e Background, acima de 7:1 | Título e corpo |
| Muted text | #4A5562 | Sobre Surface, acima de 4,5:1 | Legenda, cabeçalho de tabela, ajuda |

Por que existe: separar ação, estado e neutro.
Quando usar: Primary uma vez por tela. Success, Warning, Review, Danger e Info só em status. Neutros em todo o resto.
Valor de negócio: o operador vê o que fazer e o que está bloqueado sem ler um código.

## Texto sobre cor sólida

Botão Primary e badge sólido usam #FFFFFF. Não usar branco sobre Success, Warning ou Review claros. Nesses estados o texto é o hex escuro da tabela, em fundo claro.

Link e breadcrumb usam Info #175CD3 sobre Surface. O sublinhado aparece no hover e no foco.

## Status de negócio

O badge é pill, fundo claro, texto escuro, ponto de 8 px na cor do texto.

| Estado | Texto | Fundo | Texto |
| --- | --- | --- | --- |
| Excelente | Excelente | #E7F6EF | #0B6B42 |
| Pronto | Pronto | #E7F6EF | #0B6B42 |
| Atenção | Atenção | #FFF6E0 | #8A5A00 |
| Revisar | Revisar | #FFEDD5 | #9A3412 |
| Bloqueado | Bloqueado | #FDECEC | #B42318 |
| Em análise | Em análise | #E8F1FC | #175CD3 |

Por que existe: traduzir gate, fila e recomendação para uma decisão.
Quando usar: campanha, Product, oportunidade e ação pendente. Um badge por objeto.
Valor de negócio: "Revisar" diz o que fazer. O código interno do gate não aparece.

Mapeamento, sem mostrar o código na tela:

| Situação de negócio | Badge |
| --- | --- |
| Presell pode seguir | Pronto |
| Evidência forte e recomendação de seguir | Excelente |
| Falta um fato observado | Atenção |
| A pessoa precisa decidir | Revisar |
| Não pode publicar nem enviar | Bloqueado |
| Busca, análise ou leitura em curso | Em análise |

## Gráficos

| Série | Hex | Uso |
| --- | --- | --- |
| Série 1 | #2F3CC9 | Visitas |
| Série 2 | #175CD3 | Cliques no botão |
| Série 3 | #0B6B42 | Compras |
| Grade | #E4E7EC | Linhas do gráfico |
| Vazio | #F6F7F9 | Período sem leitura |

No máximo três séries. Sem gradiente. A legenda é texto, não só cor.

Por que existe: comparar o período no monitoramento.
Quando usar: aba Desempenho de Relatórios. Não usar gráfico no Dashboard.
Valor de negócio: a tendência do período fica legível ao lado dos três números.

## O que não usar

Verde esmeralda do console antigo, preto puro como fundo de aplicação, e cor de marca de terceiros. Segredo, token e id não ganham cor de destaque.
