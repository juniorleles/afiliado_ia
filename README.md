# Afiliado IA

Ferramenta interna para criar **presells em inglês**, publicar no seu
domínio e mandar o clique de compra para o **link de afiliado**.

Anúncio e visitante veem a **mesma URL**. O hop de afiliado só dispara
quando a pessoa clica no CTA. Sem cloaking.

## Roadmap (canonical)

Presell OS architecture, completed phases, current phase, future phases,
and the non-regression contract live in
[`docs/ROADMAP.md`](docs/ROADMAP.md). Read that file before implementing
a new phase. Never weaken completed safeguards.

The original numbered product-phase prompt log remains in
[`docs/ROADMAP_FASES.md`](docs/ROADMAP_FASES.md).

## Disciplina de fases

Leia [`docs/ROADMAP.md`](docs/ROADMAP.md) (canonical) e
[`docs/ROADMAP_FASES.md`](docs/ROADMAP_FASES.md). Uma fase por vez:
cole o prompt da fase no Cursor (Agent), valide no seu ambiente, só então
a próxima.

## Fase 1 — como validar

```bash
cd C:\workspace\afiliado_ia
npm install
npm run dev
```

Abra http://localhost:3000 — placeholder em inglês.

## Fase 2 — como validar

```bash
cd C:\workspace\afiliado_ia
npm install
npm run dev
```

1. Abra `/admin` e crie uma campanha (copy em inglês).
2. Recarregue a página — o registro continua lá (SQLite em `data/presell-os.db`).
3. Tente criar outra com o **mesmo slug** — a UI deve recusar com mensagem clara, sem erro genérico.

SQLite: `data/presell-os.db` (gitignored — **nome do arquivo não mudou de
propósito**, ver nota abaixo). `better-sqlite3` está pinado em **11.10.0**
porque o Node 20 deste Windows não tem prebuild nas versões 12+.

## Fase 3 — como validar

1. Abra `/admin`, edite (ou crie) uma campanha com um `body` usando `## `
   pra seções e `- ` pra listas.
2. Clique **"Preview"** na listagem — confirme que vira título de seção /
   lista com marcador, que o disclosure de afiliado aparece sempre, e que
   o CTA é só visual (sem link — isso é Fase 5).
3. Teste um slug inexistente em `/admin/preview/algum-slug-que-nao-existe`
   — confirme 404.

## Nota sobre o nome do projeto

O projeto se chamava `presell-os` até a Fase 3 — renomeado pra
**Afiliado IA** (`package.json`, títulos de página, `README`, `AGENTS.md`,
regra do Cursor). **O arquivo do banco de dados (`data/presell-os.db`) e o
nome interno da variável em `db.ts` não foram renomeados de propósito** —
trocar o caminho do arquivo faria o app parar de encontrar qualquer dado
local que você já tenha salvo (campanhas de teste ficariam órfãs). Se
quiser renomear o arquivo do banco também, é seguro fazer manualmente
(fechar o `npm run dev`, renomear `data/presell-os.db` pra
`data/afiliado-ia.db`, atualizar o caminho em `src/lib/db.ts`) — só não é
automático, porque mexe com dado que já existe no seu disco.

## O que este repo não é

- Não é o Mercados Autônomos
- Não é o `affiliate-ai-platform` (decision engine / Google Ads)
- Não é um gerador de HTML para colar no WordPress
