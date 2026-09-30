"use client";

import type { LpQualityLabel, LpQualityPrediction } from "@/lib/lp-quality-predictor";

const QUALITY_TEXT: Record<LpQualityLabel, string> = {
  Excellent: "text-emerald-300",
  Good: "text-emerald-300",
  Fair: "text-amber-200",
  Limited: "text-amber-300",
  Poor: "text-red-300",
};

const QUALITY_BAR: Record<LpQualityLabel, string> = {
  Excellent: "bg-emerald-500",
  Good: "bg-emerald-400",
  Fair: "bg-amber-300",
  Limited: "bg-amber-500",
  Poor: "bg-red-500",
};

export function LpQualityCard({
  prediction,
  campaignId,
}: {
  prediction: LpQualityPrediction;
  campaignId?: number;
}) {
  return (
    <section aria-label="LP quality" className="space-y-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <p className="text-sm text-zinc-400">Expected LP quality</p>
        <p className={`mt-1 text-4xl font-semibold uppercase ${QUALITY_TEXT[prediction.quality]}`}>{prediction.quality}</p>
        <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-800" aria-hidden="true">
          <div className={`h-2 rounded ${QUALITY_BAR[prediction.quality]}`} style={{ width: `${prediction.score}%` }} />
        </div>
        <p className="mt-3 text-sm text-zinc-200">Confidence {prediction.confidence}%</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Metric label="Expected visual density" value={prediction.visualDensity} />
        <Metric label="Expected information density" value={prediction.informationDensity} />
        <Metric label="Expected conversion readiness" value={prediction.conversionReadiness} />
        <Metric label="Expected CRO readiness" value={prediction.croReadiness} />
      </dl>
      <div>
        <p className="text-sm font-medium text-zinc-200">Why</p>
        {prediction.reasons.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No quality signals yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {prediction.reasons.map((reason) => (
              <li key={reason.text} className={reason.tone === "support" ? "text-sm text-emerald-300" : "text-sm text-amber-200"}>
                {reason.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">Improve</p>
        {prediction.actions.length === 0 ? (
          <p className="mt-1 text-sm text-emerald-300">No priority improvements.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {prediction.actions.map((action) => (
              <li key={action.editorHash}>
                <button
                  type="button"
                  onClick={() => openSection(action.editorHash, campaignId)}
                  className="text-left text-sm text-emerald-300 hover:underline"
                >
                  {action.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm text-zinc-400">Generation remains available. This estimate does not block it.</p>
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

function openSection(hash: string, campaignId?: number) {
  const node = document.getElementById(hash);
  if (node) {
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${hash}`);
    return;
  }
  if (campaignId) window.location.assign(`/admin/product-editor/${campaignId}#${hash}`);
}
