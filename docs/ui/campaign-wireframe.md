# Campaign Wireframes

Low fidelity. Blocks only.
Screens: Campanhas, Detalhes da Campanha, Google Ads dentro do detalhe.

## Campanhas

Header: Plataforma, Operador, Conta.
Sidebar: Campanhas (atual).
Breadcrumb: Inicio > Campanhas.
Navigation: a linha abre Detalhes da Campanha. Nova pesquisa nao mora aqui.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Campanhas                            |
| Pesquisa         +-----------------------------------------------+
| Produtos         | Campanhas                                     |
| Oportunidades    |                                               |
| Campanhas (atual)| +-------------------------------------------+ |
| Relatorios       | | Nome | Estado | Proximo passo | [ Abrir ]| |
| Configuracoes    | | ...  | Rascunho ou Publicada |          | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Sem campanhas:                                |
|                  | Nenhuma campanha.                             |
|                  | [ Ir para produtos ]                          |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Abrir.
Secondary actions: Ir para produtos, quando a lista esta vazia.
Cards: nenhum.
Tables: nome, estado de negocio, proximo passo.
Charts: nenhum.
Buttons: Abrir, Ir para produtos, Ver detalhes tecnicos.

Estado de negocio usa duas palavras: Rascunho ou Publicada. Proximo passo usa uma frase: Revisar anuncio, Revisar presell, ou Ver desempenho.

Purpose: achar uma campanha e o que fazer com ela.
Next action: Detalhes da Campanha.
Critical information: nome, se esta em rascunho ou publicada, qual e o proximo passo.
Hidden information: slug, id, codigos de policy, percentual de completude, e a fila de doze atalhos. Ficam em Ver detalhes tecnicos.

## Detalhes da Campanha

Header e sidebar: Campanhas (atual).
Breadcrumb: Inicio > Campanhas > [nome].
Navigation: as abas trocam o miolo sem sair da campanha. Revisar anuncio leva a aba Google Ads.

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Campanhas > [nome]                   |
| Pesquisa         +-----------------------------------------------+
| Produtos         | [nome da campanha]                            |
| Oportunidades    | Estado: Rascunho                              |
| Campanhas (atual)|                                               |
| Relatorios       | Abas:                                         |
| Configuracoes    | [ Presell ] [ Anuncio ] [ Publicacao ]        |
|                  |                                               |
|                  | Aba Presell                                   |
|                  | +-------------------------------------------+ |
|                  | | Previa da pagina                          | |
|                  | +-------------------------------------------+ |
|                  | Conteudo | Midia | Disposicao | Historico    |
|                  | [ area da peca escolhida ]                   |
|                  | [ Salvar presell ]                            |
|                  |                                               |
|                  | [ Revisar anuncio ]                           |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Primary action: Revisar anuncio.
Secondary actions: Salvar presell, trocar Conteudo, Midia, Disposicao, Historico.
Cards: estado da campanha, previa.
Tables: nenhuma na aba principal. Historico, se aberto, e uma tabela Data e O que mudou.
Charts: nenhum.
Buttons: Presell, Anuncio, Publicacao, Salvar presell, Revisar anuncio, Ver detalhes tecnicos.

A aba Publicacao pede uma decisao explicita para tornar a presell publica. O texto diz que isso nao envia o anuncio. Ela nao e a acao primaria.

Purpose: preparar a presell num so lugar.
Next action: aba Google Ads.
Critical information: nome, rascunho ou publicada, previa, peca em edicao.
Hidden information: caminhos /admin, aliases de slug, camadas imported e effective. Ficam em Ver detalhes tecnicos.

## Google Ads

Mesmo header, sidebar e breadcrumb da campanha.
A aba Anuncio e o passo Google Ads da jornada.

```text
+------------------------------------------------------------------+
| ... mesmo chrome ...                                             |
| Inicio > Campanhas > [nome] > Anuncio                            |
|                                                                  |
| Anuncio em rascunho                                              |
| Nada foi enviado.                                                |
|                                                                  |
| +------------------+ +------------------+ +------------------+   |
| | Campanha         | | Grupo            | | Anuncio          |   |
| | Pausada          | | Pausado          | | Pausado          |   |
| | Nome             | | Nome             | | Titulos          |   |
| | Orcamento diario | | Tipo de busca    | | Descricoes       |   |
| +------------------+ +------------------+ +------------------+   |
|                                                                  |
| [ Concluir revisao ]                                             |
| [ Voltar a presell ]                                             |
|                                                                  |
| [ Ver detalhes tecnicos ]                                        |
+------------------------------------------------------------------+
```

Primary action: Concluir revisao.
Secondary actions: Voltar a presell.
Cards: campanha pausada, grupo pausado, anuncio pausado.
Tables: nenhuma.
Charts: nenhum.
Buttons: Concluir revisao, Voltar a presell, Ver detalhes tecnicos. Nao ha botao Publicar anuncio.

Purpose: revisar tres rascunhos pausados.
Next action: Monitoramento, em Relatorios. Se ainda nao existe desempenho, o monitoramento explica que nao ha leitura.
Critical information: os tres estao pausados e nada foi enviado.
Hidden information: nomes de recurso, tokens, ids de conta, lances em micros. Ficam em Ver detalhes tecnicos.
