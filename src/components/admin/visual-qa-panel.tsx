"use client";

import { useState } from "react";
import type { VisualQaFinding, VisualQaReport } from "@/lib/visual-qa/types";

function FindingList({ title, items }: { title: string; items: VisualQaFinding[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${item.actionCode}-${index}`} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              {item.severity} · {item.viewport} · {item.category}
            </p>
            <p className="mt-1 text-sm text-zinc-200">{item.description}</p>
            {item.evidence ? <p className="mt-1 text-xs text-zinc-500">{item.evidence}</p> : null}
            <p className="mt-1 text-xs text-emerald-400/90">
              {item.actionCode}: {item.suggestedPresentationFix}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VisualQaPanel({
  slug,
  initialReport,
}: {
  slug: string;
  initialReport: VisualQaReport | null;
}) {
  const [report, setReport] = useState<VisualQaReport | null>(initialReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runQa() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/visual-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json()) as { report?: VisualQaReport; error?: string };
      if (!res.ok || !data.report) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Visual QA failed");
    } finally {
      setBusy(false);
    }
  }

  const mobile = report?.viewportReports.filter((vp) => vp.width <= 430) ?? [];
  const desktop = report?.viewportReports.filter((vp) => vp.width >= 1024) ?? [];

  return (
    <section className="border-b border-zinc-800 bg-zinc-950 px-6 py-5" data-visual-qa-panel="1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Visual QA</p>
          <p className="mt-1 text-sm text-zinc-400">
            Inspects the rendered page (Playwright). Separate from CONTENT_GATE. Does not publish or rewrite the page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runQa()}
          disabled={busy}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Running Visual QA…" : "Run Visual QA"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {report ? (
        <div className="mt-4">
          <p className="text-2xl font-bold tracking-wide text-zinc-50">
            VISUAL QA {report.status}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            CONTENT_GATE={report.contentGate ?? "n/a"} · publication={report.publicationStatus} ·
            template={report.template} · AI={report.aiVisualReview} · standard={report.targetStandard}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-zinc-800 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Mobile</p>
              {mobile.map((vp) => (
                <p key={vp.viewport} className="mt-1 text-sm text-zinc-200">
                  {vp.viewport} · {vp.deterministicFindings.filter((f) => f.severity !== "INFO").length} findings
                </p>
              ))}
            </div>
            <div className="rounded-md border border-zinc-800 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Desktop</p>
              {desktop.map((vp) => (
                <p key={vp.viewport} className="mt-1 text-sm text-zinc-200">
                  {vp.viewport} · {vp.deterministicFindings.filter((f) => f.severity !== "INFO").length} findings
                </p>
              ))}
            </div>
          </div>
          <FindingList title="High priority findings" items={report.highPriority} />
          <FindingList
            title="Other findings"
            items={[...report.deterministicFindings, ...report.visualFindings].filter((f) => f.severity !== "HIGH")}
          />
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">Technical</h3>
            <p className="mt-1 text-sm text-zinc-400">
              engine={report.technical.engine} · lighthouse={String(report.technical.lighthouseUsed)} ·
              headingOrderOk={String(report.technical.headingOrderOk)} · missingAlts={report.technical.missingAlts} ·
              smallTapTargets={report.technical.smallTapTargets}
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-zinc-500">
              {report.technical.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">Recommended visual fixes</h3>
            <ul className="mt-2 space-y-1">
              {report.recommendedFixes.map((fix) => (
                <li key={fix.actionCode} className="text-sm text-zinc-300">
                  <span className="font-mono text-emerald-400">{fix.actionCode}</span> — {fix.explanation}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No Visual QA report yet for this campaign.</p>
      )}
    </section>
  );
}
