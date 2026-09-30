import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";
import { openaiApiKeyConfigured, visualConceptConfig } from "@/lib/visual-concept/config";
import { planVisualConceptGeneration } from "@/lib/visual-concept/engine";
import { listRuns, readSelection, visualDesignRoot } from "@/lib/visual-concept/store";
import { generateVisualConceptsAction, selectVisualDirectionAction } from "@/app/admin/visual-concepts/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function VisualConceptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { notice } = await searchParams;
  const campaign = getCampaignBySlug(slug);
  if (!campaign) notFound();
  const plan = planVisualConceptGeneration(campaign);
  const config = visualConceptConfig();
  const runs = listRuns(visualDesignRoot(), slug);
  const latest = runs[0] ?? null;
  const selection = readSelection(visualDesignRoot(), slug);
  const keyReady = openaiApiKeyConfigured();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-400">
          <Link href="/admin" className="hover:underline">
            Admin
          </Link>
        </p>
        <h2 className="mt-2 text-xl font-semibold">Visual concepts</h2>
        <p className="mt-1 font-mono text-sm text-zinc-400">{campaign.slug}</p>
        <p className="mt-3 text-sm text-zinc-300">
          A generated image is a design reference. It does not change product facts, evidence, or publication approval.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200" role="status">
          {notice}
        </p>
      ) : null}

      <section className="space-y-2 text-sm text-zinc-300">
        <p>VISUAL_ENGINE=READY</p>
        <p>GENERATION={keyReady ? "READY_FOR_OPERATOR_CONFIRMATION" : "BLOCKED_MISSING_API_KEY"}</p>
        <p>MODEL={config.conceptModel}</p>
        <p>MASTER_MODEL={config.masterModel}</p>
        <p>QUALITY={config.quality}</p>
        <p>SIZE={config.size}</p>
        <p>FORMAT={plan?.format ?? config.outputFormat}</p>
        <p>PLANNED_IMAGE_COUNT={config.plannedImageCount}</p>
        <p>ESTIMATED_CALL_COUNT={config.estimatedCallCount}</p>
        <p>OPERATION={plan?.operation ?? "unavailable"}</p>
        <p>COMPOSITION={plan?.compositionStrategy ?? "MODEL_OUTPUT_ONLY"}</p>
      </section>

      <form action={generateVisualConceptsAction} className="space-y-3 rounded-md border border-zinc-800 p-4">
        <input type="hidden" name="slug" value={campaign.slug} />
        <input type="hidden" name="generationRequestId" value={randomUUID()} />
        <label className="block text-sm">
          Generation reason
          <input
            name="generationReason"
            required
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmGeneration" value="yes" required className="mt-1" />
          <span>I confirm this explicit action may create {config.plannedImageCount} paid concept images.</span>
        </label>
        {latest ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="regenerate" value="yes" className="mt-1" />
            <span>Replace the concepts already stored for this content version.</span>
          </label>
        ) : null}
        <button
          type="submit"
          disabled={!keyReady || !plan}
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
        >
          Generate Visual Concepts
        </button>
      </form>

      {selection ? (
        <p className="text-sm text-zinc-300">
          VISUAL_DIRECTION_SELECTED={selection.visualDirectionSelected}. HUMAN_PUBLICATION_APPROVED=NO
        </p>
      ) : null}

      {latest ? (
        <div className="grid gap-6">
          {latest.concepts.map((concept) => (
            <article key={concept.key} className="space-y-3 rounded-md border border-zinc-800 p-4">
              <h3 className="text-lg font-semibold">Concept {concept.key.toUpperCase()}</h3>
              <p className="text-sm text-zinc-300">{concept.metadata.direction}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/admin/visual-concepts/${campaign.slug}/file?run=${latest.generationId}&direction=${concept.key}`}
                alt=""
                className="max-w-full border border-zinc-800"
              />
              <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <div>model {concept.metadata.model}</div>
                <div>quality {concept.metadata.quality}</div>
                <div>size {concept.metadata.size}</div>
                <div>format {concept.metadata.format}</div>
                <div>created {concept.metadata.createdAt}</div>
                <div>prompt {concept.metadata.promptVersion}</div>
              </dl>
              <form action={selectVisualDirectionAction}>
                <input type="hidden" name="slug" value={campaign.slug} />
                <input type="hidden" name="generationId" value={latest.generationId} />
                <input type="hidden" name="directionKey" value={concept.key} />
                <button type="submit" className="text-sm text-emerald-400 hover:underline">
                  Select this direction
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-400">No concept images yet. Nothing is generated by opening this page.</p>
      )}
    </div>
  );
}
