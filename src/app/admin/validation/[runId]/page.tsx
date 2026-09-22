import Link from "next/link";
import { notFound } from "next/navigation";
import { AddProductForms } from "@/app/admin/validation/run-forms";
import { HumanReviewForm } from "@/app/admin/validation/human-review-form";
import { listDraftsForValidation } from "@/app/admin/validation/actions";
import { getValidationRun, listValidationCandidates } from "@/lib/validation/store";
import { GENERICITY_FINDINGS } from "@/lib/validation/genericity";
import { recommendedLpPreviewPath } from "@/lib/strategy/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shotSrc(rel: string | null): string | null {
  if (!rel) return null;
  return `/admin/validation/artifact?path=${encodeURIComponent(rel)}`;
}

export default async function ValidationRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getValidationRun(runId);
  if (!run) notFound();
  const candidates = listValidationCandidates(runId);
  const drafts = await listDraftsForValidation();
  const summary = run.summary;

  return (
    <div data-preview-wide className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Validation run</p>
          <h2 className="font-mono text-lg">{run.id}</h2>
          <p className="text-xs text-zinc-500">
            {run.status} · HUMAN_REVIEW não publica · CONTENT_GATE intacto
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/validation" className="text-zinc-400 hover:underline">
            Runs
          </Link>
          <Link href={`/admin/validation/${run.id}/compare`} className="text-emerald-400 hover:underline">
            Comparison view
          </Link>
        </div>
      </div>

      {summary ? (
        <dl className="grid grid-cols-2 gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm md:grid-cols-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">{key}</dt>
              <dd className="font-mono">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-zinc-500">Sem resumo até gerar candidatos. Não há score único.</p>
      )}

      {run.crossPageReview ? (
        <div className="rounded-md border border-zinc-800 p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-400">CROSS_PAGE_COMPARISON</p>
          <p>
            DIVERSITY_REVIEW={run.crossPageReview.DIVERSITY_REVIEW} · state={run.crossPageReview.state}
          </p>
          <p className="mt-1 text-zinc-400">{run.crossPageReview.reason}</p>
          {run.crossPageReview.repeatedPatterns.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-zinc-300">
              {run.crossPageReview.repeatedPatterns.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <AddProductForms runId={run.id} drafts={drafts} productKeys={run.products.map((p) => p.key)} />

      <section>
        <h3 className="text-sm font-semibold">Produtos da run</h3>
        {run.products.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nenhum produto. O operador escolhe URLs ou rascunhos reais.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {run.products.map((product) => (
              <li key={product.key}>
                {product.name} · {product.origin} · {product.sourceUrl || "sem URL"}
                {product.RECOMMENDED_STRATEGY ? (
                  <span className="mt-1 block text-xs text-emerald-300">
                    MARKET_RESEARCH_STATUS={product.MARKET_RESEARCH_STATUS} · QUALITY={product.MARKET_RESEARCH_QUALITY} ·
                    DATE={product.MARKET_RESEARCH_DATE} · SOURCES={product.MARKET_SOURCES} · RECOMMENDED=
                    {product.RECOMMENDED_STRATEGY} · CONFIDENCE={product.STRATEGY_CONFIDENCE}
                  </span>
                ) : null}
                {product.STRATEGY_RATIONALE ? (
                  <span className="mt-1 block text-xs text-zinc-400">{product.STRATEGY_RATIONALE}</span>
                ) : null}
                {product.ALTERNATIVES?.length ? (
                  <span className="mt-1 block text-xs text-zinc-500">ALTERNATIVES={product.ALTERNATIVES.join(", ")}</span>
                ) : null}
                {product.discoveryNote ? (
                  <span className="mt-1 block text-xs text-amber-300">{product.discoveryNote}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Candidatos</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-zinc-500">Gere a abordagem recomendada e as alternativas REVIEW / EDUCATIONAL / BUYER_GUIDE por produto.</p>
        ) : (
          candidates.map((candidate) => {
            const desktop = shotSrc(candidate.desktopScreenshot);
            const mobile = shotSrc(candidate.mobileScreenshot);
            return (
              <article key={candidate.id} className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {candidate.productName} · {candidate.approach}
                      {candidate.strategyMeta?.recommended ? " · RECOMMENDED" : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      theme={candidate.theme} hero={candidate.heroVariant} gate={candidate.contentQa.finalGate}{" "}
                      grounding={candidate.contentQa.groundingStatus} visual={candidate.visualQa.status} AI=
                      {candidate.aiReview.overall} packshot={candidate.assetQa.packshotFound ? "YES" : "NO"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      fingerprint={candidate.fingerprint?.heroFamily || "—"} · failures=
                      {candidate.failures.map((f) => f.type).join(",") || "none"} · HUMAN={candidate.humanReview}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <Link
                      href={recommendedLpPreviewPath(candidate.productName, candidate.id)}
                      className="text-emerald-400 hover:underline"
                    >
                      OPEN LP
                    </Link>
                    <Link
                      href={`/visual-frame/validation/${candidate.id}`}
                      className="text-xs text-zinc-500 hover:underline"
                    >
                      Frame interno
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-zinc-500">Desktop 1440</p>
                    {desktop ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={desktop} alt="" className="mt-1 max-h-56 w-full rounded border border-zinc-800 object-cover object-top" />
                    ) : (
                      <p className="text-xs text-zinc-600">sem screenshot</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Mobile 390</p>
                    {mobile ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mobile} alt="" className="mt-1 max-h-56 w-full rounded border border-zinc-800 object-cover object-top" />
                    ) : (
                      <p className="text-xs text-zinc-600">sem screenshot</p>
                    )}
                  </div>
                </div>
                {candidate.aiReview.dimensions.length > 0 ? (
                  <ul className="mt-3 grid gap-1 text-xs md:grid-cols-2">
                    {candidate.aiReview.dimensions.map((dim) => (
                      <li key={dim.dimension}>
                        {dim.dimension}={dim.verdict} — {dim.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <HumanReviewForm candidateId={candidate.id} current={candidate.humanReview} notes={candidate.humanNotes} />
              </article>
            );
          })
        )}
      </section>

      <details className="rounded-md border border-zinc-800 p-4 text-sm text-zinc-400">
        <summary className="cursor-pointer text-zinc-200">Genericity findings (identify, do not auto-fix)</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {GENERICITY_FINDINGS.map((item) => (
            <li key={item.id}>
              <span className="text-zinc-200">{item.area}:</span> {item.observation}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
