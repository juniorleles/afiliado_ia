# Product, Landing Page, and Opportunity Wireframes

Low fidelity. Blocks only.
Screens: Detalhes do Produto, Landing Page Viewer, Oportunidade, Analise.

## Detalhes do Produto

Header: Plataforma, Operador, Conta.
Sidebar: Produtos (atual).
Breadcrumb: Inicio > Produtos > [nome observado].
Navigation: Ver pagina abre o Landing Page Viewer. A oportunidade relacionada abre Oportunidade.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Produtos > [nome observado]          |
| Pesquisa         +-----------------------------------------------+
| Produtos (atual) | [nome observado]                              |
| Oportunidades    |                                               |
| Campanhas        | +------------------+ +---------------------+  |
| Relatorios       | | Marca            | | Categoria           |  |
| Configuracoes    | | [observada ou    | | [observada ou       |  |
|                  | |  Nao observada]  | |  Nao observada]     |  |
|                  | +------------------+ +---------------------+  |
|                  | +------------------+                          |
|                  | | Preco            |                          |
|                  | | [observado ou    |                          |
|                  | |  Nao observado]  |                          |
|                  | +------------------+                          |
|                  |                                               |
|                  | [ Ver pagina de destino ]                     |
|                  |                                               |
|                  | O que a pagina disse                          |
|                  | +-------------------------------------------+ |
|                  | | Afirmacao | Onde apareceu | [ Abrir ]    | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Ver oportunidade ]   [ Ver saude ]          |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Ver pagina de destino.
Secondary actions: Ver oportunidade, Ver saude, Abrir a afirmacao.
Cards: marca, categoria, preco. Vazio e "Nao observada" ou "Nao observado".
Tables: afirmacoes com o lugar da pagina.
Charts: nenhum.
Buttons: Ver pagina de destino, Ver oportunidade, Ver saude, Abrir, Ver detalhes tecnicos.

Purpose: mostrar so o que a pagina sustenta.
Next action: Landing Page Viewer.
Critical information: nome, marca, categoria, preco, e o que ficou sem observacao.
Hidden information: ids de no, origem interna, slug. Ficam em Ver detalhes tecnicos.

## Landing Page Viewer

Header e sidebar: Produtos (atual).
Breadcrumb: Inicio > Produtos > [nome] > Pagina de destino.
Navigation: Seguir para analise abre Analise. Voltar retorna ao produto.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Produtos > [nome] > Pagina           |
| Pesquisa         +-----------------------------------------------+
| Produtos (atual) | Pagina de destino                             |
| Oportunidades    |                                               |
| Campanhas        | +-------------------------------------------+ |
| Relatorios       | | A pagina abriu                            | |
| Configuracoes    | | Endereco final                            | |
|                  | | [endereco sem parametros de rastreio]     | |
|                  | | Conteudo legivel: sim ou nao              | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Leitura da pagina                             |
|                  | +-------------------------------------------+ |
|                  | |                                           | |
|                  | | bloco de texto observado                  | |
|                  | |                                           | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Seguir para analise ]    [ Voltar ]         |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Seguir para analise.
Secondary actions: Voltar ao produto.
Cards: abriu, endereco final, conteudo legivel.
Tables: nenhuma.
Charts: nenhum.
Buttons: Seguir para analise, Voltar, Ver detalhes tecnicos.

Purpose: deixar o operador ver a pagina que sustentou o produto.
Next action: Analise.
Critical information: se abriu, o endereco final em forma legivel, se ha conteudo.
Hidden information: codigo HTTP, numero de redirects, bytes, parametros de anuncio. Ficam em Ver detalhes tecnicos.

## Oportunidade

Header e sidebar: Oportunidades (atual).
Breadcrumb: Inicio > Oportunidades > [pesquisa].
Navigation: Abrir a recomendada volta para a Analise daquele produto.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Oportunidades > [pesquisa]           |
| Pesquisa         +-----------------------------------------------+
| Produtos         | Oportunidades desta pesquisa                  |
| Oportunidades    |                                               |
|  (atual)         | +-------------------------------------------+ |
| Campanhas        | | Posicao | Produto | Recomendacao | Abrir | |
| Relatorios       | | 1       | [nome]  | [tipo]       |       | |
| Configuracoes    | +-------------------------------------------+ |
|                  |                                               |
|                  | Portfolio                                     |
|                  | +------------------+ +---------------------+  |
|                  | | Idioma observado | | Pais observado      |  |
|                  | +------------------+ +---------------------+  |
|                  |                                               |
|                  | [ Abrir a recomendada ]                       |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Abrir a recomendada.
Secondary actions: abrir outra linha da tabela.
Cards: idioma observado, pais observado.
Tables: posicao, produto, recomendacao.
Charts: nenhum.
Buttons: Abrir, Abrir a recomendada, Ver detalhes tecnicos.

Purpose: ordenar o que a pesquisa sustenta e mostrar a recomendacao.
Next action: Analise do produto recomendado.
Critical information: posicao, produto, tipo de recomendacao, idioma e pais observados.
Hidden information: formula, pesos, pontuacao interna, id da oportunidade. Ficam em Ver detalhes tecnicos. Nao ha categoria inventada: se a pagina nao trouxe categoria, o portfolio nao cria uma.

## Analise

Header e sidebar: Produtos (atual).
Breadcrumb: Inicio > Produtos > [nome] > Analise.
Navigation: Criar campanha abre Detalhes da Campanha em rascunho. Nao cria anuncio enviado.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Produtos > [nome] > Analise          |
| Pesquisa         +-----------------------------------------------+
| Produtos (atual) | Analise                                       |
| Oportunidades    |                                               |
| Campanhas        | Sustenta uma campanha?                        |
| Relatorios       | +-------------------------------------------+ |
| Configuracoes    | | O que foi observado                       | |
|                  | | O que ficou sem observacao                | |
|                  | | Recomendacao da oportunidade              | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Criar campanha ]                            |
|                  | [ Voltar a pagina ]  [ Voltar ao produto ]    |
|                  |                                               |
|                  | Se faltar o essencial:                        |
|                  | Criar campanha fica indisponivel.             |
|                  | O texto diz qual campo nao foi observado.     |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Criar campanha.
Secondary actions: Voltar a pagina, Voltar ao produto.
Cards: observado, nao observado, recomendacao.
Tables: nenhuma.
Charts: nenhum.
Buttons: Criar campanha, Voltar a pagina, Voltar ao produto, Ver detalhes tecnicos.

Purpose: decidir se o produto vira campanha.
Next action: Detalhes da Campanha.
Critical information: o que a evidencia sustenta, o que falta, a recomendacao.
Hidden information: codigos de gate, completude numerica, ids. Ficam em Ver detalhes tecnicos.
