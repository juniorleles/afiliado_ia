import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignById } from "@/lib/campaigns";
import {
  findingsByCategory,
  lintCampaign,
  type LintStatus,
  type PublicationGate,
} from "@/lib/policy-linter";
import { withResolvedCampaign } from "@/lib/manual-overrides";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ embedded?: string | string[] }>;
};

const STATUS_STYLE: Record<LintStatus, string> = {
  pass: "border-emerald-500/40 bg-emerald-950/30 text-emerald-200",
  warn: "border-amber-500/40 bg-amber-950/30 text-amber-200",
  fail: "border-red-500/40 bg-red-950/30 text-red-200",
};

const GATE_STYLE: Record<PublicationGate, string> = {
  READY: "border-emerald-500 bg-emerald-950/50 text-emerald-100",
  REVIEW_REQUIRED: "border-amber-500 bg-amber-950/50 text-amber-100",
  BLOCKED: "border-red-500 bg-red-950/50 text-red-100",
};

const GATE_LABEL: Record<PublicationGate, string> = {
  READY: "READY",
  REVIEW_REQUIRED: "REVIEW REQUIRED",
  BLOCKED: "BLOCKED",
};

export default async function LintPage({ params, searchParams }: Props) {
  const notice = await (searchParams ?? Promise.resolve<{ embedded?: string | string[] }>({}));
  const embedded = (Array.isArray(notice.embedded) ? notice.embedded[0] : notice.embedded) === "studio";
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  const campaign = getCampaignById(id);
  if (!campaign) {
    notFound();
  }

  const result = lintCampaign(withResolvedCampaign(campaign));
  const groups = findingsByCategory(result);
  const blockingFails = result.findings.filter((f) => f.status === "fail" && f.blocking);

  return (
    <div className="max-w-2xl">
      {embedded ? null : (
        <>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Policy Linter V2</p>
          <h2 className="mb-1 text-xl font-medium">{campaign.name}</h2>
          <p className="mb-4 font-mono text-sm text-zinc-500">
            /p/{campaign.slug} · {campaign.publicationStatus === "published" ? "PUBLISHED" : "DRAFT"}
          </p>
        </>
      )}

      <p className="mb-6 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
        <strong className="text-zinc-200">Internal risk assessment only.</strong> This
        tool does not mean Google approved, Google compliant, guaranteed
        approval, or safe from suspension. It can miss issues and can flag
        false positives. You still review before running ads.
      </p>

      <div className={`mb-6 rounded-md border px-4 py-4 ${GATE_STYLE[result.gate]}`}>
        <p className="text-xs uppercase tracking-wide opacity-80">Publication gate (internal)</p>
        <p className="mt-1 text-3xl font-bold">{GATE_LABEL[result.gate]}</p>
        <p className="mt-2 text-sm opacity-90">
          {blockingFails.length > 0
            ? `${blockingFails.length} blocking fail(s). Do not treat the public URL as cleared.`
            : result.gate === "REVIEW_REQUIRED"
              ? "No blocking fails, but warnings need a human pass."
              : "No warns or fails on the current heuristic rules."}
        </p>
        <p className="mt-2 text-xs opacity-70">LEGACY_RISK_SCORE {result.legacyRiskScore}/100 — not the decision.</p>
      </div>

      <div className="space-y-6">
        {groups.map((group) => {
          const issues = group.findings.filter((f) => f.status !== "pass");
          const passed = group.findings.length - issues.length;
          return (
            <section key={group.category}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-zinc-100">{group.label}</h3>
                <span className={`rounded px-2 py-0.5 text-xs uppercase ${STATUS_STYLE[group.worst]}`}>
                  {group.worst}
                </span>
              </div>
              {issues.length === 0 ? (
                <p className="text-sm text-zinc-500">{passed} checks passed.</p>
              ) : (
                <ul className="space-y-3">
                  {issues.map((finding) => (
                    <li
                      key={finding.ruleId}
                      className={`rounded-md border px-4 py-3 ${STATUS_STYLE[finding.status]} ${finding.blocking && finding.status === "fail" ? "ring-2 ring-red-500/60" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs opacity-80">{finding.ruleId}</span>
                        <span className="text-xs uppercase">
                          {finding.status}
                          {finding.blocking && finding.status === "fail" ? " · blocking" : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{finding.message}</p>
                      {finding.evidence ? (
                        <p className="mt-1 text-sm opacity-90">
                          Evidence: “{finding.evidence}”
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm opacity-80">Risk: {finding.message}</p>
                      {finding.suggestion ? (
                        <p className="mt-1 text-sm opacity-90">Suggestion: {finding.suggestion}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {campaign.publicationStatus !== "published" ? (
        <Link href={`/admin/${campaign.id}/publish`} className="mt-8 mr-4 inline-block text-sm text-emerald-400 hover:underline">
          Publish…
        </Link>
      ) : null}
      <Link href="/admin" className="mt-8 inline-block text-sm text-zinc-400 hover:underline">
        ← Voltar
      </Link>
    </div>
  );
}
