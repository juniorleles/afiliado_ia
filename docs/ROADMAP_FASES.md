# Roadmap de Fases — Afiliado IA

Documento vivo. Mesma disciplina do Mercados Autônomos: **nenhuma fase
vira “completa” só porque o código foi escrito**. Completa = Cursor
executou + você rodou de verdade e reportou o resultado.

## Como trabalhar (obrigatório)

1. Só uma fase por vez.
2. Cole o **Prompt para o Cursor** da fase no chat (Agent mode).
3. O Cursor implementa **somente** aquela fase.
4. Você valida no ambiente real (`npm run dev`, testes, um fluxo manual).
5. Só então cole o prompt da fase seguinte.

Não misturar este repo com `mercados-autonomos` nem com
`affiliate-ai-platform`. Este produto é: **presell em inglês → clique no
link de afiliado**. Anúncio e visitante veem a mesma URL. Sem cloaking.

Páginas publicadas: **English only**. Painel interno pode ser PT.

| Fase | Escopo | Status |
|---|---|---|
| 1 | Fundação (Next.js, docs, regras, página placeholder) | ✅ Validada em ambiente real (print do navegador, localhost:3001) — texto e layout do placeholder confirmados |
| 2 | Modelo `Campaign` + admin CRUD (sem IA) | ✅ Validado — CRUD completo testado (criação, persistência, slug duplicado em INSERT e UPDATE, DELETE), ver nota abaixo |
| 3 | Template Review em inglês (render da campanha) | ✅ Validada em ambiente real (localhost:3003) — `##`/`-` viram `<h2>`/lista, disclosure sempre visível, CTA sem `href` |
| 4 | Publicar por slug `/p/[slug]` | ✅ Validada em ambiente real — GET 200 sem chrome de admin, `<title>` dinâmico com o headline, 404 real pra slug inexistente |
| 5 | CTA de afiliado + UTM + slot de pixel | ✅ Validada em ambiente real — UTM/gclid no href dos 3 CTAs, pixel dispara só em `/p/[slug]`, nunca no preview |
| 6 | IA gera 3 variantes de copy em inglês | ✅ Validada em ambiente real — 3 ângulos distintos (cética/benefício/urgência), inglês nativo, `## Benefits`/`## FAQ` presentes, nada salvo até clicar "Criar" |
| 7 | Validador de política (linter, não aprovação do Google) | ✅ Validada em ambiente real — score 100 pra campanha limpa, cai corretamente com claim arriscado/português real, sem falso positivo em "commute" |
| 8 | Importar produto por URL + duplicar campanha | 🟡 Código escrito e testado aqui (91/91 asserções no total), pendente de você conferir no navegador |

**Trust / linter / publicação (depois da Fase 8 de produto)** — não misturar com as linhas 1–8 acima:

| | Escopo | Status |
|---|---|---|
| Trust 1 | Páginas legais, footer, CTA same-tab, metadata | ✅ Validada (PHASE_1_STATUS=PASS) |
| Policy Linter V2 | Gate READY / REVIEW_REQUIRED / BLOCKED | ✅ Validada (PHASE_2_STATUS=PASS) |
| 2.5 | Draft / Review / Publish | ✅ Validada (PHASE_2_5_STATUS=PASS) |
| 3 | Presell Content Engine V2 | ✅ Validada (PHASE_3_STATUS=PASS) |
| 4 | Tracking & conversion foundation | ✅ Validada (PHASE_4_STATUS=PASS) |
| 5 | ClickBank sales attribution (INS v8 + extclid) | 🟡 Código escrito — pendente validação no ambiente real. INS v8 + `extclid` + `/api/clickbank/ins`. Não marcar completa até você conferir um fluxo real. |
| 6 | Page Builder V2 (templates visuais + composição) | 🟡 Código escrito nesta sessão — templates REVIEW / BUYER_GUIDE / EDITORIAL, composer determinístico, preview desktop/mobile, renderer público com legado. Não marcar completa até você conferir no navegador. |
| 7 | Visual QA Agent + PREMIUM_INTERNATIONAL | 🟡 Código escrito — Playwright + Anthropic vision, gate PASS/REVIEW_REQUIRED separado do CONTENT_GATE. Detalhe: `docs/ROADMAP.md` Phase 7 e `docs/VISUAL_STANDARD.md`. Não misturar com a “Fase 7” original (linter) deste arquivo. |
| 8 | Intelligent Page Designer + Auto Visual Optimization | 🟡 Código escrito — DesignPlan, temas, loop max 2, apresentação only. Detalhe: `docs/ROADMAP.md` Phase 8. |



**Nota — Fase 2 validada em 2 ambientes (2026-08-17)**: o CRUD original foi
testado pelo usuário no Windows real (criação, persistência, mensagem de
slug duplicado no POST). As 2 lacunas que ficaram sem teste manual (UPDATE
pra slug já existente, DELETE refletindo na listagem) foram fechadas
rodando o **SQL exato** de `db.ts`/`campaigns.ts` contra um motor SQLite
real (`node:sqlite`, nativo do Node 22, usado porque `better-sqlite3` não
instala neste sandbox por política de rede — mas a query em si é idêntica).
8/8 asserções passaram, incluindo a confirmação de que um `UPDATE` que
falha por `UNIQUE` **não deixa a linha corrompida/parcialmente alterada**.
Script em `scripts/validate-sql-behavior.cjs`, mantido no repo como
regressão rápida pra qualquer mudança futura de schema.

**Nota — desenvolvimento passou a acontecer direto no sandbox do Claude a
partir daqui (2026-08-17)**: até a Fase 2, o Cursor implementava sozinho no
Windows e só reportava resultado. A partir da Fase 3, o Claude tem acesso
direto ao código (usuário enviou o projeto), e volta a ser quem escreve e
valida o que der de validar aqui — mesmo padrão usado em
`affiliate-ai-platform` e `mercados-autonomos` no mesmo dia.

---

## Fase 3 — o que foi implementado

- `src/lib/markdown.ts` — parser de markdown restrito, **escrito do zero,
  sem dependência nova** (não dá pra `npm install` no ambiente de geração
  pra confirmar que uma lib externa instala limpo, e o subconjunto pedido
  — `## ` = seção, `- ` = lista — é pequeno o bastante pra não precisar de
  parser completo). Nunca produz HTML bruto — sempre passa pelo escaping
  automático do React, importante desde já porque a Fase 6 vai gravar
  texto de IA nesse mesmo campo.
- `src/components/campaign-template.tsx` — hero, disclosure de afiliado
  **sempre visível** (nunca condicional), corpo renderizado a partir do
  parser, CTA **só visual** por enquanto (sem link — isso é Fase 5).
- `src/app/admin/preview/[slug]/page.tsx` — rota de preview, 404 se o slug
  não existir. Dentro de `/admin` (herda o layout do admin), como o
  roadmap original já especificava.
- `src/lib/campaigns.ts` ganhou `getCampaignBySlug()` — não existia antes
  (só busca por `id`), e a Fase 4 também vai precisar dela.
- Link "Preview" adicionado na listagem do admin — sem isso, a rota
  existiria mas ninguém acharia ela clicando.
- Campo `body` do formulário ganhou texto de ajuda explicando o formato
  (`## `/`- `) e um placeholder de exemplo — sem isso, quem preenche não
  tem como adivinhar a sintaxe esperada.

**Testado neste ambiente**: 11 asserções do parser de markdown (via Node
puro, incluindo os *edge cases* — linha em branco ausente, string vazia,
múltiplas linhas em branco seguidas) + checagem de sintaxe real via `tsc`
(só erro de módulo externo não instalado, zero erro de sintaxe/JSX).

**Não testado aqui, precisa da sua conferência real**: como a preview
renderiza de verdade no navegador — cores, espaçamento, se o texto de
exemplo (`## Benefits` / `- item`) realmente vira seção/lista visualmente
como o parser promete em teste isolado.

**Validado no navegador em 2026-08-17** (localhost:3003): `## Benefits`/
`## FAQ` viram `<h2>`, `- item` vira lista com marcador, disclosure sempre
visível com o texto exato especificado, CTA renderiza como `<span>` sem
`href`. Conferido em `/`, `/admin` e `/admin/preview/winter-jacket-review`.

---

## Fase 4 — o que foi implementado

- `src/app/p/[slug]/page.tsx` — rota pública, busca por
  `getCampaignBySlug()` (já existia desde a Fase 3), `notFound()` se o
  slug não existir, reaproveita `CampaignTemplate` (mesmo componente do
  preview — de propósito, pra `/p/[slug]` e `/admin/preview/[slug]` nunca
  divergirem silenciosamente com o tempo).
- `generateMetadata()` dinâmico — o `<title>` da página pública vira o
  `headline` da campanha, não mais o "Afiliado IA" genérico do layout raiz.
- **Nenhum código extra foi necessário pra tirar o chrome do admin** —
  `/p/[slug]` é uma rota irmã de `admin/`, não filha dela, então o
  aninhamento de layout do próprio Next.js App Router já garante que ela
  não herda `admin/layout.tsx`. Confirmado lendo a árvore de pastas, não
  suposto.
- Confirmado que não existe `not-found.tsx` customizado — o 404 de slug
  inexistente cai no padrão do Next, dentro do layout raiz (sem cabeçalho
  de admin vazando).

**Testado neste ambiente**: sintaxe real via `tsc` (só erro de módulo
externo não instalado, zero erro de sintaxe/JSX) + confirmação estrutural
do aninhamento de layout (leitura direta da árvore de arquivos).

**Não testado aqui, precisa da sua conferência real**: abrir `/p/[slug]`
de verdade no navegador e confirmar visualmente que não tem nenhum chrome
de admin, que o título da aba mostra o headline da campanha (não
"Afiliado IA"), e que um slug inexistente dá 404 de verdade.

**Validado no navegador em 2026-08-17** (localhost:3003): `GET /p/winter-jacket-review`
200 sem chrome de admin, `<title>` mostrando o headline real da campanha
("Is this winter jacket actually worth it?"), `/p/um-slug-que-nao-existe`
em 404 padrão do Next. Conferido também que a rota nunca herda o layout
do admin.

---

## Fase 5 — o que foi implementado

- `src/lib/affiliate-url.ts` — `buildAffiliateHref()`, função pura, repassa
  pro link de afiliado só os parâmetros de rastreio de anúncio (`utm_*`,
  `gclid`, `fbclid`, `msclkid`) que chegaram na URL de entrada — outros
  parâmetros (`ref`, `debug`, etc.) **não** são repassados. Preserva
  qualquer query string que já exista na `affiliateUrl` cadastrada, sem
  sobrescrever. URL malformada não derruba a página — devolve o valor bruto
  em vez de lançar erro.
- `src/components/campaign-template.tsx` — CTA agora é `<a>` de verdade
  (antes era `<span>` decorativo), com `target="_blank"` e
  `rel="nofollow sponsored noopener"` (recomendação do próprio Google pra
  link de afiliado — não passa "link equity", sinaliza conteúdo
  patrocinado). **3 CTAs** (hero, meio — dividindo o corpo real da
  campanha ao meio, não uma posição arbitrária —, e final), todos com o
  mesmo `href`. Slot de pixel via `next/script`, só dispara quando
  `renderPixel` é `true`.
- `headScript` — coluna nova em `campaigns` (migração incremental em
  `db.ts`, com checagem `PRAGMA table_info` antes do `ALTER TABLE`, pra
  não quebrar rodando 2x num banco já migrado). Campo opcional no
  formulário do admin, com texto explicando que só dispara na rota
  pública, nunca no preview.
- `src/app/p/[slug]/page.tsx` — lê os parâmetros de rastreio da URL de
  entrada (`searchParams`), repassa pro template, e é a **única** rota que
  passa `renderPixel` como `true`.
- `src/app/admin/preview/[slug]/page.tsx` — **de propósito, não repassa
  parâmetro nenhum e não ativa o pixel** — evita contar visualização/
  conversão real enquanto alguém só está conferindo a campanha
  internamente.

**Testado neste ambiente**: `scripts/test-affiliate-url.ts` — 10
asserções, incluindo repasse seletivo de parâmetro, preservação de query
existente na `affiliateUrl`, e URL malformada não travando a função. Mais
os 19 testes anteriores (markdown + SQL) continuam passando — 29/29 no
total. Sintaxe checada via `tsc` em todos os 7 arquivos tocados — zero
erro de sintaxe, só erro de módulo externo esperado.

**Não testado aqui, precisa da sua conferência real**:
- Clicar num CTA de verdade e confirmar que abre o `affiliateUrl` numa aba
  nova, com os parâmetros de rastreio (se você abrir `/p/[slug]?utm_source=google&gclid=abc`,
  o link do CTA deveria carregar isso também).
- Confirmar visualmente que os 3 CTAs aparecem nos lugares certos (logo
  depois do disclosure, no meio do conteúdo, no final).
- Se tiver um pixel de teste (Meta ou Google), colar o snippet e confirmar
  que ele dispara em `/p/[slug]` mas **não** dispara em
  `/admin/preview/[slug]`.

**Validado no navegador em 2026-08-17** (localhost:3003): `/p/winter-jacket-review?utm_source=google&gclid=teste123`
— os 3 CTAs carregam `utm_source` e `gclid` no `href` de verdade
(`https://example.com/your-hop?utm_source=google&gclid=teste123`), nas 3
posições certas (após disclosure, meio, final). Pixel de teste
(`new Image().src = ...`) disparou o `GET` em `/p/[slug]` e **não**
disparou em `/admin/preview/[slug]` — confirma que a separação
preview-nunca-conta-como-real está funcionando de verdade, não só na
teoria do código.

**Nota de ambiente — versão do Node (2026-08-17)**: `node --experimental-strip-types`
só existe a partir do Node 22 — o Windows real do projeto está no Node
20.20.2, onde essa flag não existe (`bad option`). Os scripts de teste
(`scripts/test-*.ts`) rodam nesse ambiente via `npx tsx scripts/test-*.ts`
em vez da flag nativa. Meu sandbox de geração tem Node 22, então valido lá
com a flag nativa — mas o comando que **realmente** funciona no ambiente
do projeto é `tsx`. Vou passar a indicar `tsx` como comando principal daqui
pra frente, não só como alternativa.

---

## Fase 6 — o que foi implementado

- `src/lib/ai/generate-variants.ts` — núcleo da geração, chamada direta à
  API REST da Anthropic via `fetch` (sem instalar `@anthropic-ai/sdk` — não
  dá pra confirmar aqui que uma lib nova instala limpo no Windows real do
  projeto, e a API é só 1 POST JSON, não precisa de SDK). 3 partes:
  - `buildPrompt()` — pura, monta o prompt reforçando inglês nativo (não
    tradução), proibindo alegar aprovação de plataforma, proibindo
    inventar estatística/depoimento, e reforçando o mesmo formato de
    markdown restrito da Fase 3 (`## `/`- `) no corpo gerado.
  - `parseVariantsResponse()` — pura, valida a resposta (array de
    exatamente 3, cada 1 com `headline`/`body`/`ctaLabel` não-vazios),
    remove code fence se o modelo envolver o JSON em ` ```json ` mesmo
    sendo instruído a não fazer isso. Erro específico por tipo de falha,
    não mensagem genérica.
  - `generateVariants()` — orquestra: chama a API, se a validação falhar
    faz **1 retry citando o erro exato** (mesmo achado do projeto de
    afiliados hoje mais cedo: retry genérico tende a repetir o mesmo
    erro, porque o modelo não sabe o que errou), sem loop infinito.
- `src/lib/slug.ts` ganhou `slugify()` — não existia antes (só validação).
  Toda saída passa em `validateSlug()` por construção (testado).
- `src/app/admin/generate/` — fluxo em 3 passos, **nunca salva sozinho**
  (regra explícita da Fase 6 no roadmap): formulário de entrada → 3
  variantes lado a lado → `CampaignForm` (mesmo componente das Fases 1-5)
  pré-preenchido com a escolhida, usuário ainda revisa/edita e precisa
  clicar "Criar" de verdade, passando pela mesma validação de sempre
  (slug único, URL válida).
- `campaign-form.tsx` — o prop `campaign` foi alargado de `Campaign` pra
  `CampaignInput` (sem exigir `id`/`createdAt`/`updatedAt`), pra dar pra
  pré-preencher o formulário com uma variante que ainda não existe no
  banco. Mudança compatível com as telas que já usavam — `Campaign` já
  satisfaz `CampaignInput` estruturalmente.
- `.env.example` — documenta `ANTHROPIC_API_KEY`.
- Corrigido de passagem: `src/app/admin/page.tsx` tinha o texto
  `"Sem rota pública nesta fase"`, esquecido desde a Fase 2 — não é mais
  verdade desde a Fase 4. Também adicionei o link "Gerar com IA" ao lado
  de "Nova campanha".

**Achado real no processo de validação — mas o bug era meu, não do
código**: rodando `tsc` com a flag `--strict false` (que eu mesmo uso pra
reduzir ruído de módulo externo não instalado), o *narrowing* de union
type discriminado (`if (!result.ok) { result.error }`) quebrava com "Property
'error' does not exist". Reproduzi isolado, sem nenhum código do projeto —
confirmei que é a própria flag `--strict false` do TypeScript 6.0.3 que
causa isso, não o código. Registrando aqui porque quase relatei um bug que
não existia — a checagem seguinte (sem essa flag) confirma 0 erro real.

**Testado neste ambiente**: 56 asserções no total (18 novas de
`generate-variants` cobrindo prompt + validação de resposta + code fence +
cada tipo de erro de formato, 9 de `slugify`, mais as 29 anteriores) — sem
tocar rede nem chave de API real, só as funções puras. Sintaxe checada via
`tsc --strict true` (mais fiel ao `tsconfig.json` real do que minhas
tentativas anteriores) em todos os 7 arquivos — 0 erro real, só ruído
esperado de `@types/react` ausente.

**Não testado aqui, não dá pra testar sem sua chave de API**:
- A chamada real à Anthropic — se o modelo realmente responde no formato
  pedido na prática (não só nos casos que eu simulei), se o inglês sai
  natural de verdade, se o retry realmente ajuda quando o modelo erra o
  formato na 1ª tentativa.
- O fluxo completo no navegador: gerar → ver as 3 variantes → escolher →
  formulário pré-preenchido → criar campanha de verdade.

**Validado no navegador em 2026-08-17** (localhost:3004): 3 variantes com
ângulos genuinamente diferentes (cética/review, benefício, urgência),
`## Benefits` e `## FAQ` presentes nas 3, inglês nativo — sem tom de
tradução ("shivering halfway through your commute" é o tipo de frase que
só sai de quem escreve em inglês de verdade, não de tradução literal).
Boa observação sobre o próprio conteúdo: as respostas do FAQ vieram
propositalmente cautelosas ("most reviews suggest...", "check the care
label") em vez de alegar fato específico — reflexo direto da regra do
prompt de nunca inventar estatística/depoimento. É a troca certa (seguro >
persuasivo demais), mas vale ter em mente pra Fase 7: um FAQ muito hedged
pode não convencer tanto quanto um mais assertivo — não é bug, é a
prioridade de segurança escolhida de propósito funcionando como esperado.
Confirmado também que **nada foi salvo até "Criar campanha"** — o banco
permaneceu com só a campanha anterior durante toda a geração/escolha.

---

## Fase 7 — o que foi implementado

- `src/lib/policy-linter.ts` — `lintCampaign()`, função pura, **sem IA, sem
  rede** (de propósito — checklist heurístico baseado em regra, não mais
  uma chamada de API). 5 checks:
  - **Claims arriscados**: lista heurística de termos (`miracle`, `cure`,
    `guaranteed to...`, `FDA approved`, `clinically proven`, `100%
    effective`, `doctors hate this`, `one weird trick`, promessa de perda
    de peso com prazo) — `warn`, nunca bloqueia nada, só sinaliza.
  - **Headline do anúncio vs. da presell**: só roda se `adHeadline`
    (campo novo) for preenchido — sobreposição de palavras-chave
    (heurística por palavra, não semântica). Sem `adHeadline`, não
    penaliza — campo opcional de verdade, ausência de dado não é tratada
    como risco.
  - **Disclosure presente** e **CTA é clique**: os 2 são checagens
    **estruturais** (sempre passam, porque a arquitetura já garante isso
    desde a Fase 3/5) — documentado explicitamente no código como
    confirmação de garantia, não varredura de conteúdo.
  - **Texto parece inglês**: detecção heurística de vazamento de português
    (acento + palavras comuns).
  - Score 0-100, ponderado (claims 30, headline-mismatch 20, disclosure
    20, CTA 10, inglês 20).
- `adHeadline` — coluna nova em `campaigns` (mesmo padrão de migração
  incremental do `headScript`), campo opcional no formulário.
- `src/app/admin/[id]/lint/page.tsx` — relatório com o score, cada achado
  com severidade (OK/Atenção/Falhou) e o motivo, e um **aviso explícito no
  topo** deixando claro que isto não é aprovação de anúncio de plataforma
  nenhuma (regra explícita do roadmap original).
- Link "Verificar" adicionado na listagem do admin.

**Achado real testando, corrigido antes de qualquer execução real**: a
detecção de português tinha 2 bugs — só cobria os acentos `ã/õ/ç` (faltava
`á/é/í/ó/ú`), e usava `\b` (borda de palavra) ao redor de "você"/"não" —
em JavaScript, `\b` não reconhece letra acentuada como caractere de
palavra sem tratamento especial, então `\bvocê\b` simplesmente **não
batia** com "Você" no meio de uma frase real, mesmo sendo óbvio pra um
humano. Corrigido: classe de acento ampliada, substring direto sem `\b`
(sequência como "não"/"você" é distintiva o suficiente pra não precisar de
borda de palavra). Achado escrevendo o teste, antes de qualquer execução
no navegador — mesmo padrão de sempre: o teste não serve só pra confirmar
que o código funciona, serve pra achar onde ele não funciona.

**Segundo achado, agora do usuário testando de verdade no navegador**: a
correção acima (tirar o `\b`) resolveu o problema de acento, mas criou
outro — "com" virou substring solta, e "com" está **dentro** de "commute",
"come", "company", "comfortable"... a campanha real gerada pela Fase 6
("...during your commute...") caiu de 100 pra 80 por causa disso, achado
pelo próprio usuário rodando no navegador de verdade. **Os dois achados
eram, no fundo, o mesmo problema** — precisavam de 1 definição de
fronteira de palavra que funcionasse tanto pra acento quanto pra ASCII
puro, não 2 abordagens diferentes uma pra cada situação. Corrigido de vez
com `lookahead`/`lookbehind` tratando ASCII + acentos latinos comuns como
"caractere de palavra" igualmente — resolve os 2 achados com 1 mecanismo
só. Teste de regressão adicionado com o caso exato ("commute") **e** mais
9 outras palavras em inglês que continham substring de risco (company,
comfortable, complete, paragraph, comparable, parameter, remains,
maintains, domain) — confirmado que nenhuma dispara falso positivo.
Simulei a campanha real reportada e confirmei: score volta a 100.

**Terceiro achado, no próprio teste**: eu esperava que o "pior caso"
(claims arriscados + mismatch + português, tudo junto) desse um score bem
baixo (< 30) — veio 50. Investiguei antes de mudar o teste às cegas:
**não é bug**, é consequência direta do desenho — disclosure (20 pontos) e
CTA (10 pontos) são checagens estruturais que **sempre** passam, então 30
pontos são um piso garantido, não importa quão ruim o conteúdo seja.
Corrigi a expectativa do teste (`< 60`, comparando contra o caso limpo),
não o linter — o comportamento real está correto.

**Testado neste ambiente**: 70 asserções no total (14 do linter, incluindo
o caso de regressão exato do achado real e 9 outras palavras de risco
testadas juntas). Sintaxe checada via `tsc --strict true` em 7 arquivos —
0 erro real.

**Validado no navegador em 2026-08-17** (localhost:3005, antes da correção
do 2º achado): campanha limpa → 100/100, todos os achados OK, aviso de
"não é aprovação" visível sem rolar. Campanha com `miracle cure` +
português solto → 62/100 (claims em Atenção, inglês em Falhou). Ad
headline sem relação nenhuma → 50/100 (mismatch em Atenção, 0% de
sobreposição).

**Confirmado no navegador depois da correção final**:
`winter-jacket-review` (`/admin/1/lint`) voltou a 100/100 — "commute" não
dispara mais falso positivo. Reteste com português de propósito
("Você vai adorar este produto") caiu pra 80/100 com o achado certo — a
correção fechou o falso positivo sem cegar a detecção real. **Fase 7
encerrada.**

---

## Fase 8 — o que foi implementado

Decisão de desenho confirmada com o usuário antes de codar: import por URL
**nunca publica texto raspado direto** — extrai fato real e alimenta o
mesmo prompt de IA da Fase 6, que continua sendo quem escreve a narrativa
final. Evita 2 riscos: página do produto em português vazando pra copy
publicada, e claim exagerado do próprio fabricante furando o linter da
Fase 7 sem passar pela mesma disciplina de escrita.

**Duplicar campanha**:
- `duplicateCampaign()` em `campaigns.ts` — copia todos os campos, gera
  slug único automaticamente (`<slug>-copy`, `<slug>-copy-2`, ... até achar
  livre, reaproveitando `getCampaignBySlug` pra checar, nunca confiando em
  tentativa única).
- Botão "Duplicar" na listagem, vai direto pra edição da cópia (poupa 1
  clique — quase sempre vai querer ajustar algo antes de publicar).

**Import por URL**:
- `src/lib/import-product.ts` — extração via regex simples (sem lib de
  scraping — não dá pra confirmar aqui que uma lib nova instala limpo no
  Windows real, e página de produto varia demais em estrutura pra valer a
  pena parser completo nesta fase). Nome: prioriza `og:title` > `<h1>` >
  `<title>`. Bullets: primeira `<ul>` da página, teto de 8 itens.
  **Nunca inventa nome quando não acha nada** — devolve `null`, não um
  placeholder.
- **Respeita robots.txt de verdade**: busca antes de importar, parser
  simples (só o grupo `User-agent: *`), e se o path estiver bloqueado,
  lança `RobotsDisallowedError` e para — **nunca tenta contornar** (regra
  explícita do roadmap original: "se o site bloquear, falhar de forma
  explícita, sem contornar"). Ambiguidade sempre resolve pro lado mais
  restritivo.
- `generateVariants()`/`buildPrompt()` (Fase 6) ganharam
  `extractedBullets` opcional — quando presente, vira uma seção no prompt
  reforçando "use estes fatos reais, não invente estatística além deles".
- UI em `/admin/generate`: campo de URL + botão "Importar" opcional, acima
  do formulário normal — preenche o nome do produto automaticamente
  (editável) e mostra as bullets extraídas, que seguem junto quando gerar.

**Testado neste ambiente**: 91 asserções no total (15 novas do extrator —
prioridade de fonte de nome, decodificação de entidade HTML, teto de
bullets, `null` quando não acha nada, parser de robots.txt com bloqueio
total/específico/vazio/user-agent errado — mais 4 novas de `buildPrompt`
com bullets, mais 2 novas de duplicação com SQL real). Sintaxe checada via
`tsc --strict true` em 7 arquivos — 0 erro real.

**Não testado aqui, não dá pra testar sem rede real**: a extração numa
página de produto real de verdade (a estrutura HTML real pode surpreender
o parser simples — é best-effort, documentado como tal) e o robots.txt de
um site real bloqueando de propósito.

## Fase 1 — Fundação

**Escopo**: app Next.js (App Router, TypeScript, Tailwind), `.gitignore`,
`README`, este roadmap, regra do Cursor, página inicial placeholder
(inglês) deixando claro que é uma ferramenta interna.

**Fora de escopo**: Supabase, IA, templates de presell, pixels, auth.

**Como validar**: `npm install` && `npm run dev` → abrir `http://localhost:3000`
e ver o placeholder em inglês.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 1 de docs/ROADMAP_FASES.md neste repo (afiliado_ia).

Não comece a Fase 2. Não ligue Supabase, IA, templates de presell nem pixels.

Entregue: Next.js App Router + TypeScript + Tailwind, README, .gitignore,
.cursor/rules com a disciplina de fases, página inicial placeholder em inglês
explicando que published pages serão EN e o CTA vai para o affiliate hop.

Quando terminar, mostre os arquivos criados e o comando exato para eu validar.
```

---

## Fase 2 — Campaign + admin CRUD

**Escopo**: entidade `Campaign` (nome, slug, headline, body, ctaLabel,
affiliateUrl). Persistência simples (JSON local ou SQLite — decidir o
mínimo). Tela `/admin` para criar/listar/editar. Sem login ainda se for
uso local.

**Fora de escopo**: IA, publicar `/p/[slug]`, pixels.

**Como validar**: criar 1 campanha no admin e recarregar a página — o
dado permanece.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 2 de docs/ROADMAP_FASES.md.

Não comece a Fase 3. Sem IA, sem rota pública de presell, sem pixel.

Implemente Campaign + CRUD em /admin. Campos: name, slug, headline, body,
ctaLabel, affiliateUrl. Persistência local simples. Páginas publicadas
continuam planejadas em inglês — os campos de copy da campanha são EN.

Mostre como validar com um fluxo manual de 3 passos.
```

---

## Fase 3 — Template Review (EN)

**Escopo**: um template profissional de review em inglês (hero, benefícios,
FAQ, disclosure de afiliado, CTA). Ainda pode ser preview no admin, sem
URL pública obrigatória se a Fase 4 ainda não rodou — mas se `/p/[slug]`
ainda não existe, renderize em `/admin/preview/[slug]`.

**Fora de escopo**: IA gerando texto, pixels, cloaking, age-gate fake.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 3 de docs/ROADMAP_FASES.md.

Um template Review em inglês, mobile-first, usando os campos da Campaign.
Inclua affiliate disclosure visível ("I may earn a commission...").
Preview no admin. Não publique rota pública ainda se a Fase 4 não foi feita.
Não adicione IA.
```

---

## Fase 4 — Publicar por slug

**Escopo**: `GET /p/[slug]` renderiza a presell. Essa é a URL do anúncio
(Google/Meta). O visitante e o revisor veem a mesma página.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 4 de docs/ROADMAP_FASES.md.

Rota pública /p/[slug] com o template Review. 404 se o slug não existir.
A URL final do anúncio será essa rota — não o affiliate hop.
Não adicione IA nem pixel ainda.
```

---

## Fase 5 — CTA + UTM + pixel

**Escopo**: botão da presell aponta para `affiliateUrl`. Anexar UTMs
configuráveis. Slot para Facebook/Google pixel (script no `<head>` da
presell, não no admin). Vários CTAs (hero, meio, final). Sem redirect
automático para o hop.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 5 de docs/ROADMAP_FASES.md.

CTA da presell = affiliate hop (clique explícito, sem redirect forçado).
UTM no botão. Campos opcionais de pixel no Campaign. Sem cloaking.
Sem IA.
```

---

## Fase 6 — IA gera copy em inglês

**Escopo**: a partir de nome do produto + URL opcional + hop, gerar 3
variantes (headline, body, FAQ, CTA) em inglês nativo, preenchendo a
Campaign. Usuário escolhe 1. Sem publicar sozinho.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 6 de docs/ROADMAP_FASES.md.

Geração de 3 variantes de copy em inglês via API de IA, gravando na
Campaign escolhida. Não invente layout. Não afirme que o Google aprovou.
Prompt da IA: inglês nativo, sem tom de tradução PT→EN.
```

---

## Fase 7 — Validador (linter)

**Escopo**: checklist automático — claims de saúde/milagre, mismatch
headline vs anúncio (campo opcional `adHeadline`), disclosure presente,
CTA é clique e não redirect, texto parece inglês. Relatório na UI.
Isso NÃO é aprovação do Google Ads.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 7 de docs/ROADMAP_FASES.md.

Linter de presell: claims arriscados, disclosure, CTA explícito, inglês.
Mostrar score + lista de achados. Deixar claro na UI: isto não aprova
anúncio no Google. Sem cloaking. Sem página alternativa para revisor.
```

---

## Fase 8 — Importar URL + duplicar

**Escopo**: colar URL do produto, extrair nome/bullets/imagens quando
possível; botão duplicar campanha.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 8 de docs/ROADMAP_FASES.md.

Importar dados básicos a partir da URL do produto + duplicar Campaign.
Não quebrar fases anteriores. Respeitar robots/ToS — se o site bloquear,
falhar de forma explícita, sem contornar.
```
