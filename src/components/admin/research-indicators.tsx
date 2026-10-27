import { indicatorsFromResearch } from "@/lib/product-research/indicators";
import type { ProductResearchRun } from "@/lib/product-research/types";

export function ResearchIndicatorsCard({ run }: { run: ProductResearchRun | null }) {
  const indicators = indicatorsFromResearch(run);
  return (
    <section aria-label="Research indicators" className="space-y-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <p className="text-sm text-zinc-400">Research coverage</p>
        <p className="mt-1 text-3xl font-semibold text-zinc-100">
          {indicators.researchCoverage.total}/{indicators.researchCoverage.max}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{indicators.researchCoverage.status}</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Metric label="Extraction confidence" value={indicators.extractionConfidence.status} />
        <Metric label="Review completion" value={`${indicators.reviewCompletion.percent}%`} />
        <Metric label="Editorial quality" value={indicators.editorialQuality.status} />
        <Metric label="Publication readiness" value={indicators.publicationReadiness.status} />
        <Metric label="Generation readiness" value={indicators.generationReadiness.label} />
        <Metric label="Commercial authorization" value={indicators.commercialAuthorization} />
      </dl>
      <p className="text-xs text-zinc-500">{indicators.extractionConfidence.note}</p>
      <p className="text-xs text-zinc-500">{indicators.generationReadiness.note}</p>
      <p className="text-xs text-zinc-500">{indicators.publicationReadiness.reason}</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 px-3 py-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
