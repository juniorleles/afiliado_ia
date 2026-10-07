# User Journey

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 01

## Operator journey today

1. Entra em `/admin/login`.
2. Cai na lista de campanhas. O título da página é Campanhas em qualquer ferramenta.
3. Cria uma campanha em Nova campanha ou em Gerar com IA.
4. Abre, na mesma linha, Product Editor, Product Health, LP Builder, Visual, Media, Layout, History, Policy Check, Analytics e Preview.
5. Publica a presell só em Publish, depois do Policy Check.
6. Acompanha a presell em Analytics e Transações.
7. Discovery, Readiness e Validation ficam no topo, sem ligação com essa tarefa.

O operador não pesquisa o mercado, não escolhe um produto observado, não vê ranking e não revisa um rascunho pausado do Google Ads. A otimização não tem tela.

## Visitor journey

Permanece como está.

1. Home ou Reviews.
2. Abre `/p/[slug]` se a presell estiver publicada.
3. O clique no call to action é o único salto de afiliado.
4. About, Editorial Policy e as páginas legais explicam o site.

Esta jornada não usa o menu do operador.

## Target operator flow

```text
Dashboard
  ↓
Pesquisar Mercado
  ↓
Escolher Produto
  ↓
Analisar Produto
  ↓
Gerar Campanha
  ↓
Google Ads
  ↓
Monitoramento
```

### 1. Dashboard

O operador vê a última pesquisa, produtos sem campanha, rascunhos e ações de otimização ainda sem aprovação.
Primary action: continuar de onde parou.
Se não houver trabalho, a ação é pesquisar o mercado.

### 2. Pesquisar Mercado

Informa palavra-chave, país, idioma e dispositivo.
A tela devolve patrocinados, orgânicos e o tempo da busca.
Em seguida mostra até três páginas coletadas, com HTTP, redirects, URL final e HTML.
Sem URL https patrocinada, a coleta não é inventada a partir do orgânico.

### 3. Escolher Produto

A lista mostra só nome, marca, categoria e preço observados.
O operador escolhe um produto. Campo vazio continua vazio.

### 4. Analisar Produto

A análise mostra a ficha e a evidência.
Saídas possíveis: gerar campanha, ou voltar à lista porque a evidência não sustenta o anúncio.
Oportunidades entra aqui como apoio: ranking, portfólio e recomendação da mesma pesquisa. A recomendação não cria a campanha sozinha.

### 5. Gerar Campanha

O workspace abre em rascunho.
A presell é editada nesse workspace: conteúdo, mídia, layout, histórico e prévia.
Policy Check e a publicação da presell continuam sendo uma decisão explícita, dentro da campanha, e não são aprovação de anúncio.

### 6. Google Ads

O workspace mostra três rascunhos pausados: campanha, grupo e anúncio.
A tela deixa claro que nada foi enviado.
Publicar no Google Ads não faz parte deste fluxo.

### 7. Monitoramento

Relatórios mostram o desempenho da presell, as transações e a otimização.
A otimização lista recomendação e ações pendentes.
Nenhuma ação é executada nesta jornada. Aprovar continua sendo um passo futuro, fora desta arquitetura.

## What each step hands to the next

| Step | Hands off |
| --- | --- |
| Dashboard | a tarefa em aberto, ou uma pesquisa nova |
| Pesquisar Mercado | resultado da SERP e páginas coletadas |
| Escolher Produto | um produto observado |
| Analisar Produto | ficha, evidência e recomendação |
| Gerar Campanha | rascunho de presell |
| Google Ads | rascunho pausado não enviado |
| Monitoramento | desempenho e ações ainda pendentes |

## Entry points that stay available

- Campanhas abre a lista sem obrigar uma pesquisa nova.
- Produtos abre editor e saúde de uma campanha já existente.
- Relatórios abre analytics e transações de uma presell já publicada.
- Configurações abre sessão, prontidão, discovery e laboratório sem entrar no fluxo.

## Out of this journey

- Implementar telas, componentes, CSS ou APIs.
- Publicar presell.
- Enviar campanha, grupo ou anúncio ao Google Ads.
- Executar pause, resume ou mudança de orçamento.
- Mostrar segredos, ids internos ou códigos de gate na navegação principal.
