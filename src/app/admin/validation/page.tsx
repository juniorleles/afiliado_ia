import { createValidationRunAction } from "@/app/admin/validation/actions";
import { ValidationBoard } from "@/app/admin/validation/validation-board";
import { brandFromFacts, formatUpdated, gateLabel, gateTone, policyShare, type ValidationRow } from "@/app/admin/validation/validation-view";
import { Button } from "@/components/ui/button";
import { getCampaignById } from "@/lib/campaigns";
import { listValidationCandidates, listValidationRuns } from "@/lib/validation/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function createRun() {
  "use server";
  await createValidationRunAction("Local validation lab");
}

export default async function ValidationLabPage() {
  const rows = buildRows();
  return (
    <section aria-label="Central de validação" className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-h1">Validações</h1>
          <p className="mt-ds-8 max-w-2xl text-body text-muted-foreground">
            Diagnóstico interno. Os candidatos permanecem em rascunho. Esta tela não publica e não envia anúncios.
          </p>
        </div>
        <form action={createRun}>
          <Button type="submit">Nova validação</Button>
        </form>
      </header>
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">Nenhuma validação gravada.</p>
      ) : (
        <ValidationBoard rows={rows} />
      )}
    </section>
  );
}

function buildRows(): ValidationRow[] {
  let runs: ReturnType<typeof listValidationRuns> = [];
  try {
    runs = listValidationRuns();
  } catch {
    return [];
  }
  const rows: ValidationRow[] = [];
  for (const run of runs) {
    const candidates = readCandidates(run.id);
    const score = run.summary
      ? policyShare(run.summary.POLICY_READY_COUNT, run.summary.POLICY_REVIEW_COUNT, run.summary.POLICY_BLOCKED_COUNT)
      : "—";
    const products = run.products.length > 0 ? run.products : [null];
    for (const product of products) {
      const candidate = product
        ? candidates.find((item) => item.strategyMeta?.recommended && item.productKey === product.key)
          || candidates.find((item) => item.productKey === product.key)
          || null
        : candidates[0] ?? null;
      const gate = run.status === "FAILED" ? "FAILED" : candidate?.contentQa.finalGate || candidate?.contentQa.policyGate || "";
      const campaignId = product?.campaignId;
      const campaign = campaignId ? getCampaignById(campaignId) : null;
      rows.push({
        key: `${run.id}:${product?.key || "empty"}`,
        href: `/admin/validation/${run.id}`,
        date: run.createdAt,
        dateLabel: formatUpdated(run.createdAt),
        campaign: campaign?.name || (campaignId ? `Campanha ${campaignId}` : "Não associada"),
        product: product?.name || "Nenhum produto",
        brand: brandFromFacts(candidate?.factsJson),
        score,
        publication: candidate ? "Rascunho" : "Não observada",
        policy: gate ? gateLabel(gate) : gateLabel(run.status === "FAILED" ? "FAILED" : ""),
        policyTone: gateTone(gate || (run.status === "FAILED" ? "FAILED" : "")),
        recommendation: product?.RECOMMENDED_STRATEGY || candidate?.approach || "Não registrada",
      });
    }
  }
  return rows;
}

function readCandidates(runId: string) {
  try {
    return listValidationCandidates(runId);
  } catch {
    return [];
  }
}
