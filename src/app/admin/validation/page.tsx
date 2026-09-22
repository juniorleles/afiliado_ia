import Link from "next/link";
import { createValidationRunAction } from "@/app/admin/validation/actions";
import { listValidationRuns } from "@/lib/validation/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function createRun() {
  "use server";
  await createValidationRunAction("Local validation lab");
}

export default async function ValidationLabPage() {
  const runs = listValidationRuns();
  return (
    <div data-preview-wide className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Local Validation Lab</p>
          <h2 className="mt-1 text-xl font-semibold">Product &amp; LP diversity</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Diagnostic only. Candidates stay DRAFT / INTERNAL. No publish, no PAGE_VIEW, no pixel, no affiliate hop.
            Do not fabricate products — import operator URLs or attach existing drafts.
          </p>
          <p className="mt-2 text-xs uppercase tracking-wide text-amber-300">
            Production deployment: PAUSED_BY_OPERATOR
          </p>
        </div>
        <form action={createRun}>
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Nova run
          </button>
        </form>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-zinc-400">
          Nenhuma run ainda. Crie uma e selecione produtos reais.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-mono text-sm">{run.id}</p>
                <p className="text-xs text-zinc-400">
                  {run.createdAt} · {run.status} · products={run.products.length} · diversity=
                  {run.structuralDiversity || "—"}
                </p>
              </div>
              <Link href={`/admin/validation/${run.id}`} className="text-sm text-emerald-400 hover:underline">
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
