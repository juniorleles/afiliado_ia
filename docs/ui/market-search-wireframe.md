# Market Search Wireframes

Low fidelity. Blocks only.
Screens: Pesquisa de Mercado, Resultado da Pesquisa.

## Pesquisa de Mercado

Header: Plataforma, Operador, Conta.
Sidebar: Pesquisa (atual).
Breadcrumb: Inicio > Pesquisa de Mercado.
Navigation: Pesquisar abre o Resultado. A sidebar permanece.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Pesquisa de Mercado                  |
| Pesquisa (atual) +-----------------------------------------------+
| Produtos         | Nova pesquisa                                 |
| Oportunidades    |                                               |
| Campanhas        | Palavra-chave                                 |
| Relatorios       | [                                            ]|
| Configuracoes    |                                               |
|                  | Pais            Idioma         Dispositivo    |
|                  | [ US        ]   [ en       ]   [ desktop   ]  |
|                  |                                               |
|                  | [ Pesquisar ]                                 |
|                  |                                               |
|                  | Pesquisas recentes                            |
|                  | +-------------------------------------------+ |
|                  | | Palavra | Pais | Quando | [ Abrir ]      | |
|                  | | ...     | ...  | ...    |                | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Pesquisar.
Secondary actions: Abrir uma pesquisa recente.
Cards: nenhum.
Tables: pesquisas recentes, colunas Palavra, Pais, Quando.
Charts: nenhum.
Buttons: Pesquisar, Abrir, Ver detalhes tecnicos.

Purpose: pedir uma busca de mercado.
Next action: Resultado da Pesquisa.
Critical information: palavra-chave, pais, idioma, dispositivo.
Hidden information: chave de acesso, endereco do provedor, corpo do pedido. Isso so abre em Ver detalhes tecnicos.

## Resultado da Pesquisa

Header e sidebar iguais. Pesquisa continua atual.
Breadcrumb: Inicio > Pesquisa de Mercado > Resultado.
Navigation: a linha de um produto abre Detalhes do Produto. Ver paginas abre o bloco de paginas nesta mesma tela e, em seguida, o Landing Page Viewer.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Pesquisa de Mercado > Resultado      |
| Pesquisa (atual) +-----------------------------------------------+
| Produtos         | Resultado: [palavra] em [pais]                |
| Oportunidades    |                                               |
| Campanhas        | +-------------+ +-------------+ +-----------+ |
| Relatorios       | | Patrocinados| | Organicos   | | Tempo     | |
| Configuracoes    | | [quantidade]| | [quantidade]| | [duracao] | |
|                  | +-------------+ +-------------+ +-----------+ |
|                  |                                               |
|                  | [ Ver paginas coletadas ]                     |
|                  |                                               |
|                  | Anuncios                                      |
|                  | +-------------------------------------------+ |
|                  | | Titulo | Posicao | [ Ver produto ]       | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Resultados organicos                          |
|                  | +-------------------------------------------+ |
|                  | | Titulo | Posicao | sem coleta automatica | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Paginas coletadas (no maximo 3)               |
|                  | +-------------------------------------------+ |
|                  | | Pagina abriu? | Endereco final | [ Ver ] | |
|                  | +-------------------------------------------+ |
|                  | Se nao houver pagina https:                   |
|                  | Nenhuma pagina de anuncio para coletar.       |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Ver paginas coletadas.
Secondary actions: Ver produto, nova pesquisa (volta ao formulario pelo breadcrumb Pesquisa de Mercado).
Cards: patrocinados, organicos, tempo.
Tables: anuncios, organicos, paginas coletadas.
Charts: nenhum.
Buttons: Ver paginas coletadas, Ver produto, Ver, Ver detalhes tecnicos.

Purpose: mostrar o que a busca devolveu, separado em anuncio e organico.
Next action: Detalhes do Produto, ou Landing Page Viewer a partir de Ver.
Critical information: quantos anuncios, quantos organicos, duracao, se a pagina de anuncio abriu e qual o endereco final.
Hidden information: URL completa com parametros, marcador de anuncio, codigo HTTP, quantidade de redirects e tamanho do HTML. Ficam em Ver detalhes tecnicos. Resultado organico nao e recolhido como se fosse anuncio.
