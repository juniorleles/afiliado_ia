# Roadmap de Fases — Presell OS

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
| 1 | Fundação (Next.js, docs, regras, página placeholder) | Código escrito, pendente de o usuário conferir no browser |
| 2 | Modelo `Campaign` + admin CRUD (sem IA) | Código escrito, pendente de validação real |
| 3 | Template Review em inglês (render da campanha) | Não iniciada |
| 4 | Publicar por slug `/p/[slug]` | Não iniciada |
| 5 | CTA de afiliado + UTM + slot de pixel | Não iniciada |
| 6 | IA gera 3 variantes de copy em inglês | Não iniciada |
| 7 | Validador de política (linter, não aprovação do Google) | Não iniciada |
| 8 | Importar produto por URL + duplicar campanha | Não iniciada |

---

## Fase 1 — Fundação

**Escopo**: app Next.js (App Router, TypeScript, Tailwind), `.gitignore`,
`README`, este roadmap, regra do Cursor, página inicial placeholder
(inglês) deixando claro que é uma ferramenta interna.

**Fora de escopo**: Supabase, IA, templates de presell, pixels, auth.

**Como validar**: `npm install` && `npm run dev` → abrir `http://localhost:3000`
e ver o placeholder em inglês.

### Prompt para o Cursor

```
Execute SOMENTE a Fase 1 de docs/ROADMAP_FASES.md neste repo (presell-os).

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
