# Dashboard Wireframe

Low fidelity. Blocks only.

## Chrome

Header: Plataforma, Operador, Conta.
Sidebar: Dashboard (atual), Pesquisa, Produtos, Oportunidades, Campanhas, Relatorios, Configuracoes.
Breadcrumb: Inicio > Dashboard.
Navigation: a sidebar troca de area. Cada card abre a tela daquela tarefa.

## Layout

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard (atual)| Inicio > Dashboard                            |
| Pesquisa         +-----------------------------------------------+
| Produtos         | Trabalho em aberto                            |
| Oportunidades    |                                               |
| Campanhas        | +-------------------------------------------+ |
| Relatorios       | | Continuar                                 | |
| Configuracoes    | | [ultima tarefa em linguagem de negocio]  | |
|                  | | [ Continuar ]                             | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | +----------------+ +------------------------+ |
|                  | | Pesquisas      | | Produtos sem campanha  | |
|                  | | [quantidade]   | | [quantidade]           | |
|                  | | [ Abrir ]      | | [ Escolher produto ]   | |
|                  | +----------------+ +------------------------+ |
|                  |                                               |
|                  | +----------------+ +------------------------+ |
|                  | | Rascunhos      | | Acoes por aprovar      | |
|                  | | [quantidade]   | | [quantidade]           | |
|                  | | [ Abrir ]      | | [ Revisar ]            | |
|                  | +----------------+ +------------------------+ |
|                  |                                               |
|                  | Se nao houver trabalho:                       |
|                  | +-------------------------------------------+ |
|                  | | Nenhuma tarefa em aberto.                 | |
|                  | | [ Pesquisar mercado ]                     | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

## Regions

Primary action: Continuar. Se a lista estiver vazia, a acao passa a ser Pesquisar mercado.
Secondary actions: Abrir pesquisas, Escolher produto, Abrir rascunhos, Revisar acoes.
Cards: quatro contagens de trabalho, mais o cartao Continuar.
Tables: nenhuma.
Charts: nenhum.
Buttons: Continuar, Pesquisar mercado, Abrir, Escolher produto, Revisar, Ver detalhes tecnicos.

O painel "Ver detalhes tecnicos" fica fechado. Aberto, lista identificadores da ultima tarefa. Nao aparece no cartao.

## Validation

Purpose: mostrar o que o operador precisa decidir agora.
Primary action: Continuar.
Next action: a tela da tarefa (pesquisa, produto, campanha ou relatorio).
Critical information: a ultima tarefa e as quatro contagens.
Hidden information: ids, slugs, codigos de estado e versao do sistema.
