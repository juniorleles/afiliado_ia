# Settings Wireframe

Low fidelity. Blocks only.
Screen: Configuracoes.

## Chrome

Header: Plataforma, Operador, Conta. Conta marca esta area.
Sidebar: Configuracoes (atual).
Breadcrumb: Inicio > Configuracoes > [secao].
Navigation: quatro secoes na propria pagina. A sidebar nao ganha filhos.

## Layout

```text
+------------------------------------------------------------------+
| Plataforma                                   Operador    Conta   |
+------------------+-----------------------------------------------+
| Dashboard        | Inicio > Configuracoes                        |
| Pesquisa         +-----------------------------------------------+
| Produtos         | Configuracoes                                 |
| Oportunidades    |                                               |
| Campanhas        | Secoes:                                       |
| Relatorios       | [ Sessao ] [ Prontidao ] [ Fontes ] [ Lab ]   |
| Configuracoes    |                                               |
|  (atual)         | Secao Sessao                                  |
|                  | +-------------------------------------------+ |
|                  | | Operador conectado                       | |
|                  | | [ Sair ]                                 | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Secao Prontidao                               |
|                  | +-------------------------------------------+ |
|                  | | Item de negocio | Pronto ou Faltando      | |
|                  | | Busca de mercado                        | |
|                  | | Conta de anuncios                       | |
|                  | | Publicacao da presell                   | |
|                  | +-------------------------------------------+ |
|                  | Faltando abre uma frase do que o operador    |
|                  | precisa configurar fora desta tela.          |
|                  | [ Resolver o que falta ]                      |
|                  |                                               |
|                  | Secao Fontes (fechada por padrao)             |
|                  | +-------------------------------------------+ |
|                  | | Fontes de descoberta                     | |
|                  | | [ Abrir lista ]                          | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | Secao Lab (fechada por padrao)                |
|                  | +-------------------------------------------+ |
|                  | | Laboratorio interno                      | |
|                  | | Nao publica pagina nem anuncio.          | |
|                  | | [ Abrir laboratorio ]                    | |
|                  | +-------------------------------------------+ |
|                  |                                               |
|                  | [ Ver detalhes tecnicos ]                     |
+------------------+-----------------------------------------------+
```

Lista de fontes, quando aberta, e uma tabela Nome e Situacao (ativa ou pausada). Laboratorio aberto lista estudos pelo nome dado pelo operador, com Abrir. Nenhum dos dois publica.

## Regions

Primary action: Resolver o que falta, na Prontidao. Se tudo estiver pronto, a acao primaria da Sessao e Sair.
Secondary actions: Sair, Abrir lista, Abrir laboratorio, trocar de secao.
Cards: operador conectado, cada item de prontidao, fontes fechadas, laboratorio fechado.
Tables: fontes, so depois de Abrir lista. Estudos, so depois de Abrir laboratorio.
Charts: nenhum.
Buttons: Sessao, Prontidao, Fontes, Lab, Sair, Resolver o que falta, Abrir lista, Abrir laboratorio, Ver detalhes tecnicos.

Resolver o que falta explica o item em uma frase. Nao pede segredo nesta tela e nao mostra valor de credencial.

## Validation

Purpose: conta, o que falta para operar, e as ferramentas internas.
Primary action: Resolver o que falta.
Next action: voltar ao trabalho depois de entender o item faltante. A tela nao completa a configuracao sozinha.
Critical information: operador conectado, busca de mercado pronta ou faltando, conta de anuncios pronta ou faltando, publicacao da presell pronta ou faltando.
Hidden information: nomes de variaveis, chaves, versao, fila, capacidade, ids de run. Ficam em Ver detalhes tecnicos.
