# Presell OS

Ferramenta interna para criar **presells em inglês**, publicar no seu
domínio e mandar o clique de compra para o **link de afiliado**.

Anúncio e visitante veem a **mesma URL**. O hop de afiliado só dispara
quando a pessoa clica no CTA. Sem cloaking.

## Disciplina de fases

Leia [`docs/ROADMAP_FASES.md`](docs/ROADMAP_FASES.md). Uma fase por vez:
cole o prompt da fase no Cursor (Agent), valide no seu ambiente, só então
a próxima.

## Fase 1 — como validar

```bash
cd C:\workspace\presell-os
npm install
npm run dev
```

Abra http://localhost:3000 — placeholder em inglês.

## Fase 2 — como validar

```bash
cd C:\workspace\presell-os
npm install
npm run dev
```

1. Abra `/admin` e crie uma campanha (copy em inglês).
2. Recarregue a página — o registro continua lá (SQLite em `data/presell-os.db`).
3. Tente criar outra com o **mesmo slug** — a UI deve recusar com mensagem clara, sem erro genérico.

SQLite: `data/presell-os.db` (gitignored). `better-sqlite3` está pinado em **11.10.0** porque o Node 20 deste Windows não tem prebuild nas versões 12+.

## O que este repo não é

- Não é o Mercados Autônomos
- Não é o `affiliate-ai-platform` (decision engine / Google Ads)
- Não é um gerador de HTML para colar no WordPress
