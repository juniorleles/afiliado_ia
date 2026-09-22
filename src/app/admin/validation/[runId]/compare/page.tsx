import Link from "next/link";
import { notFound } from "next/navigation";
import { CompareClient } from "@/app/admin/validation/[runId]/compare/compare-client";
import { getValidationRun, listValidationCandidates } from "@/lib/validation/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ValidationComparePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getValidationRun(runId);
  if (!run) notFound();
  const candidates = listValidationCandidates(runId);

  return (
    <div data-preview-wide className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Comparison · human review</p>
          <h2 className="text-lg font-semibold">Side-by-side candidates</h2>
        </div>
        <Link href={`/admin/validation/${runId}`} className="text-sm text-emerald-400 hover:underline">
          Voltar à run
        </Link>
      </div>
      {candidates.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem candidatos nesta run.</p>
      ) : (
        <CompareClient candidates={candidates} />
      )}
    </div>
  );
}
