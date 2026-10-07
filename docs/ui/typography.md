# Typography

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 03

## Famílias

| Ordem | Família | Papel |
| --- | --- | --- |
| 1 | Inter | Texto de interface |
| 2 | Geist | Se Inter não carregar |
| 3 | system-ui, sem-serif | Se as duas anteriores não carregarem |

Conteúdo de Headline, Description, Ad, Keyword, Product, Landing page e Creative asset usa a mesma família. O idioma desses campos é inglês. O restante da interface é pt-BR.

Números de métrica usam Inter com algarismos tabulares, para a coluna não pular.

## Escala

| Estilo | Tamanho | Linha | Peso | Uso |
| --- | --- | --- | --- | --- |
| H1 | 28 px | 36 px | 600 | Título da tela |
| H2 | 22 px | 30 px | 600 | Seção |
| H3 | 18 px | 26 px | 600 | Card e aba ativa em contexto de título |
| Body | 14 px | 22 px | 400 | Texto, campo, item de menu |
| Body strong | 14 px | 22 px | 600 | Nome de campanha, valor em tabela |
| Caption | 12 px | 16 px | 400 | Ajuda, breadcrumb, cabeçalho de tabela |
| Button | 14 px | 20 px | 500 | Botão |
| Table | 13 px | 20 px | 400 | Célula |
| Metric | 28 px | 36 px | 600 | Número do metric card |

Tela estreita: H1 desce para 24 px / 32 px. Body não desce de 14 px.

## Regras

- Uma H1 por tela. Ela repete o último item do breadcrumb só quando o breadcrumb não basta para dizer onde se está. Na prática, a H1 é o objeto: o nome do Product, o nome da campanha, ou o nome da área.
- Caption em Muted text. Não usar caption para a ação primária.
- Linha de tabela em Table. O nome do objeto em Body strong.
- Botão não usa caixa alta. A frase é curta: "Pesquisar", "Continuar", "Revisar Ad".
- Keyword, Headline, Description e o texto do Ad não são traduzidos, reescritos nem cortados com reticências no meio da palavra. Se não couber, a célula quebra a linha ou abre na tela do objeto.

## Por estilo

H1. Por que existe: dizer qual decisão esta tela pede. Quando: no topo do conteúdo. Valor: o operador sabe se está na busca, no Product ou na campanha.

H2. Por que existe: separar blocos da mesma decisão. Quando: "Ads", "Resultados orgânicos", "Ações pendentes". Valor: a leitura segue a jornada, não a estrutura interna.

H3. Por que existe: nomear um card. Quando: métrica ou grupo curto. Valor: o número tem um assunto.

Body. Por que existe: explicar a consequência em uma ou duas frases. Quando: estado vazio, bloqueio, confirmação. Valor: a frase diz o que falta, sem código.

Caption. Por que existe: datar, filtrar, orientar. Quando: breadcrumb, cabeçalho, ajuda de campo. Valor: o contexto fica perto do dado e menor que o dado.

Button. Por que existe: a ação tem o mesmo peso em toda tela. Quando: todo botão. Valor: "Criar campanha" não parece um link perdido.

Table. Por que existe: comparar muitas linhas. Quando: pesquisas, campanhas, transações, ações. Valor: nome, estado e próximo passo cabem numa varredura.

Metric. Por que existe: o número da decisão. Quando: visitas, cliques no botão, compras, contagens do Dashboard. Valor: o resultado aparece antes da tabela.
