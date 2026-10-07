# Screen Inventory

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 01

47 pages exist today. Slug aliases are the same screen as the campaign-id page. Proposed screens have no route yet.

## Findings that apply to every current operator page

Purpose is split across tools instead of a business task. The shared heading says Campanhas even when the page is Discovery or Readiness. Primary actions are links in a row, not one next step.

## Visitor screens

### Home `/`

Purpose: apresentar o site e as reviews publicadas.
Primary action: abrir Reviews.
Secondary actions: ler a política editorial.
Expected inputs: nenhuma.
Expected outputs: até seis reviews publicadas e o método de revisão.
Required components: cabeçalho, introdução, grade de reviews, rodapé.

### Reviews `/reviews`

Purpose: listar as reviews publicadas.
Primary action: abrir uma review.
Secondary actions: voltar à Home.
Expected inputs: nenhuma.
Expected outputs: cards das páginas publicadas.
Required components: lista, estado vazio.

### Presell `/p/[slug]`

Purpose: a página pública que o anúncio usa como URL final.
Primary action: o call to action de afiliado, no clique.
Secondary actions: ler a página e as políticas.
Expected inputs: slug publicado.
Expected outputs: a presell em inglês. Rascunho não publica esta URL.
Required components: conteúdo da presell, disclosure, rodapé legal.

### About, Editorial Policy, Affiliate Disclosure, Privacy, Terms, Contact

Purpose: confiança e obrigações do site público.
Primary action: ler a política.
Secondary actions: ir a Contact ou voltar às reviews.
Expected inputs: nenhuma. Contact mostra e-mail só quando estiver configurado.
Expected outputs: texto institucional em inglês.
Required components: título, corpo, navegação legal.

### Candidate preview `/preview/[slug]/[candidate]`

Purpose: ver um candidato interno.
Primary action: voltar à geração.
Secondary actions: nenhuma de publicação.
Expected inputs: slug e candidate id.
Expected outputs: prévia marcada como interna.
Required components: prévia, link de retorno.

### Visual frame `/visual-frame/[slug]`, lab `/visual-frame-lab/[slug]`, validation frame `/visual-frame/validation/[candidateId]`

Purpose: inspeção visual interna.
Primary action: observar o frame.
Secondary actions: nenhuma no menu principal.
Expected inputs: slug ou candidate id.
Expected outputs: o frame de validação.
Required components: frame. Estas telas ficam no laboratório, fora da navegação principal.

## Operator screens that exist

### Acesso `/admin/login`

Purpose: autenticar o operador.
Primary action: entrar.
Secondary actions: nenhuma.
Expected inputs: credencial do operador.
Expected outputs: sessão autenticada.
Required components: formulário, erro de acesso.

### Lista de campanhas `/admin`

Purpose: ver e abrir campanhas.
Primary action: criar campanha.
Secondary actions: gerar com IA, abrir validation, e doze atalhos por linha.
Expected inputs: nenhuma.
Expected outputs: nome, slug, publication, policy, completeness.
Required components: lista, estado vazio, avisos de publish. No alvo, a linha mostra estado de negócio e uma ação, e os doze atalhos saem da lista.

### Nova campanha `/admin/new`

Purpose: criar um rascunho manual.
Primary action: salvar rascunho.
Secondary actions: voltar à lista.
Expected inputs: dados iniciais da campanha.
Expected outputs: campanha em rascunho.
Required components: formulário.

### Gerar `/admin/generate`

Purpose: importar fatos e recomendar uma primeira estratégia de presell.
Primary action: gerar o rascunho.
Secondary actions: abrir o builder do preview.
Expected inputs: URL ou fatos informados pelo operador.
Expected outputs: rascunho não publicado. Texto de IA não é evidência.
Required components: passos de importação, prévia, aviso de que nada foi publicado.

### Editar `/admin/[id]/edit`

Purpose: alterar a campanha.
Primary action: salvar.
Secondary actions: voltar à lista.
Expected inputs: campos da campanha.
Expected outputs: campanha atualizada. Conteúdo publicado editado volta a rascunho.
Required components: formulário.

### Policy Check `/admin/[id]/lint`

Purpose: gate interno antes da publicação da presell.
Primary action: seguir para publicar quando o gate permitir.
Secondary actions: voltar e corrigir.
Expected inputs: campanha.
Expected outputs: gate e achados. Não é aprovação do Google Ads.
Required components: resultado do gate, link de publicação.

### Publicar `/admin/[id]/publish`

Purpose: decisão explícita de tornar `/p/[slug]` pública.
Primary action: publicar.
Secondary actions: voltar ao policy check, voltar à lista.
Expected inputs: campanha em rascunho com gate aceitável.
Expected outputs: presell pública ou permanência em rascunho.
Required components: confirmação, estado atual.

### Analytics `/admin/[id]/analytics`

Purpose: funil da presell.
Primary action: trocar o período.
Secondary actions: abrir transações, voltar à lista.
Expected inputs: campanha e período (hoje, 7 dias, 30 dias, tudo).
Expected outputs: métricas de primeira parte e comércio.
Required components: seletor de período, números, link de transações.

### Preview admin `/admin/preview/[slug]`

Purpose: ver a presell antes de publicar, em camadas imported e effective.
Primary action: alternar a camada.
Secondary actions: abrir builder, visual, media, layout, history.
Expected inputs: slug.
Expected outputs: prévia. Não é a URL do anúncio.
Required components: prévia, seletor de camada.

### Product Editor `/admin/product-editor/[campaignId]`

Purpose: editar o produto e a completude.
Primary action: salvar o que o operador confirma.
Secondary actions: baixar evidência, ver prévia imported, ver prévia effective.
Expected inputs: campanha.
Expected outputs: fatos resolvidos. A evidência hoje é rota, não tela.
Required components: editor, completude, links de prévia.

### Product Health `/admin/product-health/[campaignId]`

Purpose: mostrar o que falta no produto.
Primary action: ir ao editor no trecho incompleto.
Secondary actions: voltar à lista.
Expected inputs: campanha.
Expected outputs: saúde e categorias de completude.
Required components: status, categorias, histórico.

### LP Builder, Visual, Media, Layout, History

Routes: `/admin/lp-builder/[campaignId]`, `/admin/lp-visual/[campaignId]`, `/admin/lp-media/[campaignId]`, `/admin/lp-layout/[campaignId]`, `/admin/lp-versions/[campaignId]`, mais os aliases `.../slug/[slug]`, e `/admin/lp-builder/candidate/[candidateId]`.

Purpose: montar a presell.
Primary action: salvar a peça aberta.
Secondary actions: abrir as outras peças e a prévia.
Expected inputs: campanha.
Expected outputs: conteúdo, mídia, layout ou histórico do rascunho.
Required components: uma área de trabalho com abas, não cinco destinos no menu. Os aliases de slug não são telas novas.

### Visual concepts `/admin/visual-concepts/[slug]`

Purpose: ver conceitos visuais do slug.
Primary action: revisar o conceito.
Secondary actions: voltar à lista.
Expected inputs: slug.
Expected outputs: conceitos.
Required components: lista de conceitos. Entra no workspace, não no menu principal.

### Transações `/admin/transactions`

Purpose: comércio atribuído.
Primary action: abrir o analytics da campanha.
Secondary actions: voltar à lista.
Expected inputs: nenhuma.
Expected outputs: linhas de transação.
Required components: tabela.

### Readiness `/admin/system/readiness`

Purpose: diagnóstico operacional.
Primary action: identificar o item que falta.
Secondary actions: nenhuma.
Expected inputs: nenhuma. Segredos não aparecem.
Expected outputs: pares de estado. Hoje as chaves são técnicas.
Required components: lista de prontidão em linguagem de negócio.

### Validation `/admin/validation`, `/admin/validation/[runId]`, `/admin/validation/[runId]/compare`

Purpose: laboratório local de diversidade.
Primary action: criar ou abrir uma run.
Secondary actions: comparar.
Expected inputs: URLs do operador ou rascunhos existentes.
Expected outputs: run interna. Não publica.
Required components: lista de runs, detalhe, comparação.

### Discovery `/admin/discovery`, health, sources, source detail, queue, scheduler

Purpose: registro, fila e agenda de fontes. Leitura e planejamento.
Primary action: abrir a fonte, a fila ou a agenda.
Secondary actions: ver saúde.
Expected inputs: nenhuma execução a partir destas telas.
Expected outputs: contagens, estado da fila, agendas.
Required components: painel, lista de fontes, ficha da fonte, fila, agenda. Ficam em Configurações.

## Proposed screens

These screens define the business path that has no page today.

### Dashboard

Purpose: dizer o próximo passo.
Primary action: continuar a tarefa mais recente.
Secondary actions: nova pesquisa, abrir campanhas, abrir relatórios.
Expected inputs: nenhuma.
Expected outputs: pesquisas, produtos, oportunidades, rascunhos e ações pendentes.
Required components: resumo e atalhos.

### Nova pesquisa

Purpose: disparar uma busca.
Primary action: pesquisar.
Secondary actions: limpar o formulário.
Expected inputs: palavra-chave, país, idioma, dispositivo.
Expected outputs: um resultado de pesquisa.
Required components: formulário.

### Resultado da pesquisa

Purpose: separar patrocinado e orgânico.
Primary action: escolher um produto observado.
Secondary actions: abrir páginas coletadas, voltar à busca.
Expected inputs: a busca concluída.
Expected outputs: contagens, tempo, listas. Sem anúncio https, a coleta não começa.
Required components: listas patrocinada e orgânica, estado vazio.

### Páginas coletadas

Purpose: mostrar o que foi buscado nas páginas.
Primary action: abrir o produto da página.
Secondary actions: voltar ao resultado.
Expected inputs: até três páginas https.
Expected outputs: status HTTP, redirects, URL final, presença de HTML.
Required components: lista de páginas, estado de falha.

### Produtos observados

Purpose: listar nome, marca, categoria e preço vindos das páginas.
Primary action: analisar um produto.
Secondary actions: comparar com a oportunidade.
Expected inputs: identificação já feita.
Expected outputs: só campos observados. Ausência permanece visível.
Required components: tabela observada.

### Análise do produto

Purpose: decidir se o produto sustenta uma campanha.
Primary action: gerar campanha.
Secondary actions: voltar aos observados, abrir evidência.
Expected inputs: produto escolhido.
Expected outputs: ficha e evidência.
Required components: ficha, evidência, ação de gerar.

### Ranking, portfólio e recomendação

Purpose: ordenar oportunidades e registrar a recomendação.
Primary action: seguir a oportunidade recomendada.
Secondary actions: ver portfólio e a evidência da recomendação.
Expected inputs: relatório de mercado.
Expected outputs: ordem, agrupamento por idioma e país, tipo de recomendação.
Required components: lista ordenada, portfólio, bloco de recomendação.

### Rascunho Google Ads

Purpose: mostrar campanha, grupo e anúncio pausados.
Primary action: revisar o rascunho.
Secondary actions: voltar ao workspace. Não há publicar nesta arquitetura.
Expected inputs: produto e presell do workspace.
Expected outputs: três rascunhos pausados e a confirmação de que nada foi enviado.
Required components: três cartões de rascunho, aviso de não enviado.

### Otimização

Purpose: ler métricas, recomendação e ações pendentes.
Primary action: marcar a ação como ainda pendente de aprovação.
Secondary actions: abrir o desempenho da presell.
Expected inputs: campanha com leitura disponível.
Expected outputs: relatório de desempenho, recomendação, ações não executadas. Sem conta ou sem campanha, a tela diz o que falta.
Required components: métricas, recomendação, lista de ações pendentes, estado bloqueado.
