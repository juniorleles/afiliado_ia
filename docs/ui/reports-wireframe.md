# Reports Wireframe

Low fidelity. Blocks only.
Screen: Relatorios. O passo Monitoramento da jornada e esta tela.

## Chrome

Header: Plataforma, Operador, Conta.
Sidebar: Relatorios (atual).
Breadcrumb: Inicio > Relatorios > [nome da campanha].
Navigation: as tres abas trocam o miolo. A campanha vem do passo anterior ou da lista de relatorios.

## Layout

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Relatorios > [campanha]              |
| Pesquisa         +-----------------------------------------------+
| Produtos         | Monitoramento                                 |
| Oportunidades    | [nome da campanha]                            |
| Campanhas        |                                               |
| Relatorios       | Periodo                                       |
|  (atual)         | [ Hoje ] [ 7 dias ] [ 30 dias ] [ Tudo ]      |
| Configuracoes    |                                               |
|                  | Abas:                                         |
|                  | [ Desempenho ] [ Transacoes ] [ Otimizacao ]  |
|                  |                                               |
|                  | Aba Desempenho                                |
|                  | +-------------+ +-------------+ +-----------+ |
|                  | | Visitas     | | Cliques no  | | Compras   | |
|                  | |             | | botao       | |           | |
|                  | +-------------+ +-------------+ +-----------+ |
|                  |                                               |
|                  | +-------------------------------------------+ |
|                  | | Grafico do periodo                        | |
|                  | | bloco simples, sem serie inventada        | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Aba Otimizacao                                |
|                  | +-------------------------------------------+ |
|                  | | Recomendacao                              | |
|                  | | Motivo em uma frase                       | |
|                  | +-------------------------------------------+ |
|                  | Acoes pendentes                               |
|                  | +-------------------------------------------+ |
|                  | | Acao | Ainda nao executada | [ Revisar ] | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Revisar acao pendente ]                     |
|                  |                                               |
|                  | Sem leitura disponivel:                       |
|                  | Nao ha desempenho para esta campanha.         |
|                  | Diz se falta conta ou se o anuncio nao saiu.  |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Aba Transacoes:

```text
+------------------------------------------------------------------+
| Quando | Campanha | Valor | [ Abrir desempenho ]                 |
+------------------------------------------------------------------+
```

## Regions

Primary action: Revisar acao pendente.
Secondary actions: trocar periodo, abrir Transacoes, abrir Desempenho, Abrir desempenho numa linha.
Cards: visitas, cliques no botao, compras, recomendacao.
Tables: acoes pendentes, transacoes.
Charts: um bloco "Grafico do periodo" na aba Desempenho. Sem numeros de exemplo.
Buttons: Hoje, 7 dias, 30 dias, Tudo, Desempenho, Transacoes, Otimizacao, Revisar, Revisar acao pendente, Abrir desempenho, Ver detalhes tecnicos.

Revisar abre o motivo e a evidencia. Nao ha botao Executar, Pausar ou Retomar.

## Validation

Purpose: ler o que aconteceu e o que ainda precisa de aprovacao.
Primary action: Revisar acao pendente.
Next action: permanecer na acao, marcada como nao executada.
Critical information: visitas, cliques no botao, compras, recomendacao, acoes ainda pendentes.
Hidden information: consultas, custo em micros, codigos de regra, resource names. Ficam em Ver detalhes tecnicos.
