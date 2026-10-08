# Google Ads live operations — v3.2.0

Date: 2026-10-08

The operations center reads campaigns that were already published and runs the existing synchronizer, metrics collector, performance analyzer, recommendation engine, and pause/resume rules. It stores their snapshots and waits for an operator. Nothing is executed during synchronization.

## Architecture

No second optimization engine was added. `src/lib/integrations/google-ads-operations/pipeline.ts` calls `createCampaignSynchronizer`, `createMetricsCollector`, `createPerformanceAnalyzer`, `createOptimizationRecommendationEngine`, and `createPauseResumeRulesEngine`. Keyword and asset rows use the same Google Ads HTTP client as those hosts. The recommendation rule table is the one already shipped with the recommendation engine.

Snapshots and audits are insert-only. An action can move from pending to approved or rejected, and from approved to executed. The snapshot body is not rewritten.

## Synchronization

For each published campaign resource name, the synchronizer reads the campaign, budget, labels, ad groups, ads, and change status. A following search reads keyword criteria and campaign assets. Resource names and statuses are stored in `google_ads_operation_snapshots`. The local campaigns table is not changed.

## Metrics

The collector still owns the read. The operations page can ask for today, yesterday, the last 7 days, the last 30 days, or a custom pair of dates. An omitted or unknown window stays `LAST_30_DAYS`. Impressions, clicks, CTR, average CPC, conversions, conversion value, cost, and search impression share are the figures the collector already copies. CPA and ROAS on the dashboard use `costPerConversion` and `returnOnAdSpend`. Average position, lost impression share, and quality score are not fields on that collector, so they are not filled in.

## Optimization

The performance analyzer produces the trend report. The recommendation engine produces the recommendation set, including reason, evidence, and confidence. The expected impact restates the direction and change already on that evidence. Pause and resume candidates come from the existing rules engine and stay `executed: false` until a later, separate approval.

The displayed labels follow the existing kinds: increase budget, decrease budget, low CTR, replace RSA, landing-page trend, keyword review, pause campaign, and resume campaign. A kind the engine did not emit is not added.

## Approval Flow

The operations page lists pending actions with reason, evidence, confidence, and expected impact. Approve and reject are explicit. Execute appears only after approval. A pending action was refused by the executor in the test, before any mutate.

An operator can also propose pause or resume for a campaign, ad group, or keyword, a budget update, an RSA update, or a negative keyword. The resource must already appear in a stored snapshot or publication. The proposal is inserted as pending and is not sent.

## Executed Actions

The test approved one pause and then executed it. The mutate status was `PAUSED`. A later read confirmed `PAUSED`. A second execution was refused. The audit row stores the operator, the reason, the resource name, and the before and after records. The original snapshot text was unchanged.

Resume, enable, budget, RSA, and negative-keyword mutates exist for an approved action of that kind. They were not sent in this run.

## Security Review

The access token and the developer token stay on the request. They are not written into snapshots, actions, audits, or the dashboard. Approval and execution require the same operator session as the other Google Ads controls. A manager login customer id is sent only when it is ten digits and differs from the selected customer.

## Performance

The dashboard at `/admin/google-ads/operacoes` shows the connected account, campaign counts, paused and active counts, conversions, CPA, ROAS, spend, revenue, recommendation counts, pending actions, executions today, and the last synchronization. With no connected account and no publication, those figures stay empty or zero. The page does not overflow at 390px or 768px. CSV exports return `text/csv`. The PDF path is the print page at `/admin/google-ads/operacoes/imprimir`.

## Known Limitations

This installation still has the OAuth environment names unset, and no paused publication is stored, so a live Google account was not synchronized.

Quality score, average position, and lost impression share are outside the current collector. Device and network recommendations appear only when the existing device rule matches. High CPA and excellent-performer rows are not invented beside the engine output.

The pause rule enabled for this center is the existing cost threshold. The other operational rules stay disabled so a missing figure does not replace a pause candidate with manual review. The synchronizer itself does not add the manager login header; the keyword, asset, and execution calls do.

RSA execution requires headlines and descriptions that already pass the existing validators. Budget execution requires an integer amount in micros and the budget resource from the last sync. The PDF file is produced by the browser print dialog.

## Files changed

- `src/lib/integrations/google-ads-operations/pipeline.ts`
- `src/lib/integrations/google-ads-operations/execute.ts`
- `src/lib/integrations/google-ads-operations/store.ts`
- `src/lib/integrations/google-ads-operations/reports.ts`
- `src/app/admin/google-ads/operacoes/page.tsx`
- `src/app/admin/google-ads/operacoes/actions.ts`
- `src/app/admin/google-ads/operacoes/exportar/route.ts`
- `src/app/admin/google-ads/operacoes/imprimir/page.tsx`
- `src/app/admin/google-ads/operacoes/imprimir/print-button.tsx`
- `src/lib/optimization-metrics/google-metrics-client.ts`
- `src/lib/optimization-metrics/metrics-collector.ts`
- `src/lib/db.ts`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/navigation.ts`
- `src/app/admin/[id]/google-ads/page.tsx`
- `scripts/test-google-ads-live-operations.ts`
