# UX Findings

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 05

Achados da revisão. Nada foi corrigido no protótipo nem no sistema visual.

## Critical

Nenhum.

## High

### H1. Análise não existe no protótipo

A arquitetura, o inventário e o wireframe de produto definem Análise como a tela em que o operador decide se o Product vira campanha. A jornada desta revisão exige esse passo entre Produto e Criar Campanha.

O protótipo não tem rota de Análise. Landing page abre Oportunidade. Oportunidade e o botão secundário do Product abrem o detalhe da campanha.

Efeito: a implementação que copiar o protótipo publica o atalho e apaga a decisão desenhada.

### H2. A ação primária do Product não é a decisão

No wireframe, a ação primária de Análise é Criar campanha, e ela fica indisponível quando falta um fato observado. No protótipo, a ação primária do Product é Ver Landing page. Criar campanha aparece como ação secundária e sempre pode ser clicada, mesmo com categoria não observada.

Efeito: o operador cria a campanha sem passar pela tela que deveria impedir esse passo.

## Medium

### M1. Pesquisar ignora a Keyword digitada

O formulário aceita edição e sempre abre o resultado de `joint pain supplement`, com Dynamic Joint. Não há aviso de que o texto digitado foi descartado.

### M2. Badges fora do vocabulário

O sistema visual tem seis estados: Excelente, Pronto, Atenção, Revisar, Bloqueado, Em análise. O protótipo mostra também Pausada, Monitorar e Faltando. Pausada descreve o Ad. Monitorar é a recomendação. Faltando é prontidão. Os três papéis estão misturados no mesmo componente de status.

### M3. Idioma da página

A interface do operador é pt-BR. O documento raiz permanece `lang="en"`. O atributo no bloco do protótipo não substitui o idioma da página para leitor de tela.

### M4. Métricas simuladas parecem desempenho

Visitas 128, cliques 14 e compras 2 aparecem como números de monitoramento. A faixa diz que os dados são simulados. O cartão da métrica não diz. Quem ignorar a faixa lê resultado de campanha.

## Low

### L1. A faixa de protótipo compete com o título

Toda tela repete o aviso antes do H1. O aviso é necessário. O peso visual é o de um bloco de conteúdo.

### L2. Relatórios e Monitoramento são um passo só

O wireframe coloca Monitoramento dentro de Relatórios. O protótipo faz isso e titula a tela Monitoramento. A jornada de aceitação lista os dois nomes em sequência. Não são duas telas.
