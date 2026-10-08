# Validation Lab experience — v3.1.1

Date: 2026-10-08

The validation list is now a decision board. The run page is a validation report. The stored results and the routes are the same.

## Old experience

`/admin/validation` listed `val_…` identifiers, a run status, a product count, and a diversity token. Abrir opened a technical run page with the same identifier, raw summary keys, and the candidate engine fields.

## New experience

The list shows the validation date, campaign, product, brand, quality score, publication status, policy badge, recommendation, last validation, and Abrir.

Filters cover search, campaign, product, status, quality score, and date.

Abrir opens `/admin/validation/[runId]`. The report header shows campaign, product, brand, date, overall score, and publication readiness. Result cards cover policy, SEO, HTML, performance, accessibility, media, assets, evidence, landing page, and Google Ads. Issues are grouped as critical, high, medium, and low. The publication line reads Pronta para publicar, Revisão necessária, or Bloqueada from the stored gate. The timeline lists earlier runs for the same product. Actions are Executar novamente, Abrir campanha, Abrir landing page, and Exportar relatório.

The existing import, draft, generation, review, and comparison controls stay inside Ferramentas do laboratório.

## Components reused

Card, Badge, Button, SearchInput, Select, EmptyState, and the existing validation store, candidate records, human review form, and product forms. The quality center still embeds this list.

## Files changed

- `src/app/admin/validation/page.tsx`
- `src/app/admin/validation/validation-board.tsx`
- `src/app/admin/validation/validation-view.ts`
- `src/app/admin/validation/print-report.tsx`
- `src/app/admin/validation/[runId]/page.tsx`
- `src/app/admin/[id]/edit/quality-center.tsx`
- `src/components/layout/app-layout.tsx`

## UX improvements

The operator reads a product and a policy badge instead of a run id. Search for a product name narrows the list. A missing name shows an empty state. The report leads with the stored gate. Secrets stay off the page.

## Known limitations

The lab does not store a single 0–100 quality score. The score stays "—" unless the stored policy counts can be shown as the share that was ready. The badge color follows the stored gate.

Brand stays "Não observada" when the stored facts have no manufacturer. A run without a campaign id stays "Não associada", and Abrir campanha stays disabled. The operator name is not stored.

SEO, HTML, and accessibility are not fields on the lab snapshot, so those cards stay without an audit. Google Ads shows the existing connection status. Executar novamente uses the existing new-run action. Exportar relatório prints the page. The laboratory tools inside the disclosure stay in English.

Checked in the browser: 15 validations loaded, a product search showed 9 of 15, an unknown name showed 0 of 15, and a report opened with Bloqueada, the result cards, and the issue groups. At 390px and 768px the pages did not grow wider than the screen. The list and the report returned HTTP 200, as did the quality-center laboratory tab.
