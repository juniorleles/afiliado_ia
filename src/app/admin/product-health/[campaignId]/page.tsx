import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { listManualOverrides, loadResolvedProductFacts, withResolvedCampaign } from "@/lib/manual-overrides";
import {
  analyzeProductCompleteness,
  dashboardCategories,
  type CompletenessCategory,
  type CompletenessStatus,
  type ProductHealth,
} from "@/lib/product-completeness";
import { ensureEvidenceBaseline, evidenceOriginPercents } from "@/lib/evidence-manager";
import { listCompletenessHistory, recordCompletenessAnalysis } from "@/lib/product-completeness-store";

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ embedded?: string | string[] }>;
};

const HEALTH_LABEL: Record<ProductHealth, string> = {
  READY: "READY",
  NEEDS_REVIEW: "NEEDS REVIEW",
  INCOMPLETE: "INCOMPLETE",
  BLOCKED: "BLOCKED",
};

const STATUS_CLASS: Record<CompletenessStatus | ProductHealth, string> = {
  COMPLETE: "text-emerald-300",
  READY: "text-emerald-300",
  PARTIAL: "text-amber-300",
  NEEDS_REVIEW: "text-amber-300",
  EMPTY: "text-zinc-400",
  INCOMPLETE: "text-zinc-300",
  BLOCKED: "text-red-300",
  UNKNOWN: "text-zinc-500",
};

export default async function ProductHealthPage({ params, searchParams }: Props) {
  const embeddedFlag = (await searchParams)?.embedded;
  const embedded = (Array.isArray(embeddedFlag) ? embeddedFlag[0] : embeddedFlag) === "studio";
  await requireAdmin();
  const { campaignId: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const stored = getCampaignById(id);
  if (!stored) notFound();

  const campaign = withResolvedCampaign(stored);
  const facts = loadResolvedProductFacts(stored);
  const overrides = listManualOverrides(stored.id);
  const manualEditedAt = overrides.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  const trackingOverride = overrides.some((row) => row.field === "trackingUrl");
  const report = analyzeProductCompleteness({
    facts,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    imageUrl: campaign.productImageSrc || facts?.productImageUrl || null,
    imageProvenance: campaign.productImageProvenance || facts?.productImageProvenance || null,
    trackingOrigin: trackingOverride ? "MANUAL" : null,
    manualEditedAt,
  });
  recordCompletenessAnalysis(stored.id, report);
  ensureEvidenceBaseline({
    campaignId: stored.id,
    sourceFactsJson: stored.sourceFactsJson ?? null,
    affiliateUrl: stored.affiliateUrl,
    ctaLabel: stored.ctaLabel,
    createdAt: stored.createdAt,
    overrides: overrides.map((row) => ({ field: row.field, value: row.value, updatedAt: row.updatedAt })),
  });
  const evidenceShares = evidenceOriginPercents(stored.id);
  const history = listCompletenessHistory(stored.id);
  const lastAnalysis = history.at(-1)?.analyzedAt ?? null;

  return (
    <div data-preview-wide className="space-y-8">
      {embedded ? null : <div>
        <p className="text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-zinc-100">
            Campaigns
          </Link>
          <span className="px-2">/</span>
          <span>{campaign.name}</span>
        </p>
        <h2 className="mt-1 text-xl font-medium">Product Health</h2>
        <p className="mt-1 font-mono text-sm text-zinc-400">{campaign.slug}</p>
      </div>}

      <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-sm text-zinc-400">Overall completeness</p>
        <p className="mt-1 text-4xl font-semibold text-zinc-50">{report.totalScore}%</p>
        <p className={`mt-2 text-sm font-medium uppercase tracking-wide ${STATUS_CLASS[report.health]}`}>
          {HEALTH_LABEL[report.health]}
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          This score informs the operator. It does not block research, landing-page generation, or publication.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Score label="Importer" value={report.importerScore} />
          <Score label="Manual" value={report.manualScore} />
          <Score label="Total" value={report.totalScore} />
        </dl>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Score label="AUTO" value={evidenceShares.auto} />
          <Score label="MANUAL" value={evidenceShares.manual} />
          <Score label="UNKNOWN" value={evidenceShares.unknown} />
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dashboardCategories(report).map((item) => (
          <HealthCard key={item.id} campaignId={stored.id} category={item} />
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Category analysis</h3>
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {report.categories.map((item) => (
            <li key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.label}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide">
                  <span className={STATUS_CLASS[item.status]}>{item.status}</span>
                  <span className="text-zinc-400">{item.origin ?? "—"}</span>
                  <EditorLink campaignId={stored.id} category={item} />
                </div>
              </div>
              <ul className="text-sm text-zinc-300">
                {item.details.map((detail, index) => (
                  <li key={`${item.id}-${index}`}>{detail}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-zinc-800 p-4">
        <h3 className="text-lg font-medium">History</h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <HistoryItem label="Last analysis" value={lastAnalysis} />
          <HistoryItem label="Last manual edit" value={report.manualEditedAt} />
          <HistoryItem label="Last import" value={report.importedAt} />
        </dl>
        <p className="mt-4 text-sm text-zinc-400">Completeness trend</p>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No stored analysis yet.</p>
        ) : (
          <ol className="mt-2 flex flex-wrap gap-2">
            {history.map((point) => (
              <li key={point.analyzedAt} className="rounded border border-zinc-700 px-2 py-1 text-sm text-zinc-200">
                {point.totalScore}%
                <span className="ml-2 text-xs text-zinc-500">{point.analyzedAt.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-xl font-medium text-zinc-100">{value}%</dd>
    </div>
  );
}

function HistoryItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{value ?? "Not recorded"}</dd>
    </div>
  );
}

function HealthCard({ campaignId, category }: { campaignId: number; category: CompletenessCategory }) {
  return (
    <article className="space-y-3 rounded-md border border-zinc-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{category.label}</h3>
        <span className={`text-xs font-medium uppercase tracking-wide ${STATUS_CLASS[category.status]}`}>{category.status}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-zinc-800">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${category.completion}%` }} />
      </div>
      <p className="text-sm text-zinc-400">
        Origin {category.origin ?? "—"} · {category.completion}%
      </p>
      <EditorLink campaignId={campaignId} category={category} />
    </article>
  );
}

function EditorLink({ campaignId, category }: { campaignId: number; category: CompletenessCategory }) {
  const complete = category.status === "COMPLETE";
  return (
    <Link href={`/admin/product-editor/${campaignId}#${category.editorHash}`} className="text-sm text-emerald-300 hover:underline">
      {complete ? "View" : "Fix Now"}
    </Link>
  );
}
