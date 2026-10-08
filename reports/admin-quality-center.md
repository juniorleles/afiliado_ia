# Quality Center — v3.1.1 execution 06

Date: 2026-10-08

The validation area of the campaign workspace is now one Quality Center. Policy check, the validation lab, and analytics stay the modules inside it. Their routes stay available.

## Workspace structure

The center is `/admin/[id]/edit?aba=validacao`. The area is the `ferramenta` query.

Top to bottom:

1. Header: campaign, product, overall quality score, publication status, policy status, and last validation.
2. Score card: the existing policy score from 0 to 100. Green when the internal gate is ready, yellow when review is required, red when blocked. The card says "Pronta para publicação", "Revisão necessária", or "Bloqueada".
3. Tabs: Painel, Política, Laboratório, and Análises.
4. The open module.

The campaign header and the administration sidebar stay in place.

## Validation categories

The painel lists Política, SEO, HTML, Desempenho, Acessibilidade, Links, Mídia, Ativos, Conteúdo, and Google Ads. Each card shows status, score, warnings, and a link into the existing module.

Política uses the existing linter score and gate. Links, Conteúdo, and Google Ads use that same linter weight on the matching category. SEO, HTML, desempenho, acessibilidade, and mídia stay "Sem auditoria gravada" until a Visual QA report exists. Ativos show the stored product asset status. Google Ads also shows when the account is not connected.

The issues panel groups the existing policy findings and any stored Visual QA findings into Crítico, Alto, Médio, and Baixo. Each row keeps the stored description, recommendation, area, and a link to the policy page or the preview.

## Analytics integration

The painel reads the existing campaign analytics for CTR, attributed sales, and visits. The Análises tab embeds the campaign analytics page. The Laboratório tab embeds the validation lab, including its run list and the existing Nova run action. The painel timeline lists lab runs recorded for this campaign and the stored page versions.

## Routes reused

- `/admin/[id]/edit?aba=validacao&ferramenta=painel|verificacao|laboratorio|analytics`
- `/admin/[id]/lint`
- `/admin/validation`
- `/admin/validation/[runId]`
- `/admin/[id]/analytics`
- `/admin/preview/[slug]`

The campaign menu opens the quality center. The standalone lint, lab, and analytics routes still render their own pages.

## Files changed

- `src/app/admin/[id]/edit/quality-center.tsx`
- `src/app/admin/[id]/edit/workspace.tsx`
- `src/app/admin/[id]/lint/page.tsx`
- `src/app/admin/campaign-board.tsx`

## UX improvements

The operator reads one score, one category grid, and one issues list before opening the existing checker. Policy, the lab, and analytics stay one tab away. Top actions open the lab, the policy check, the existing policy report, and the campaign.

## Known limitations

There is no separate SEO score and no Lighthouse score in the stored audits. Those cards stay without a number until a report exists. The overall figure is the existing policy score. Its color follows the internal gate.

Lab runs do not store an operator name, so the history says "Não registrado". The painel lists runs tied to this campaign. The laboratory tab still shows the full lab.

Embedded policy, lab, and analytics controls stay in English. Range links inside analytics still open the standalone analytics route. Relatório opens the existing lint page. Executar validação opens the lab. It does not start a run by itself.

Checked on campaign 184: the painel, policy, lab, and analytics tabs returned HTTP 200, as did `/admin/184/lint`, `/admin/validation`, and `/admin/184/analytics`. In the browser the score was 95 with "Revisão necessária", the policy tab showed the existing gate, the lab listed stored runs, and analytics showed CTR and visits. ArrowRight moved focus from Painel to Política. At 358px the campaign tabs scroll (686px).
