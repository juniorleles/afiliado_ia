"use client";

import { useState } from "react";
import { restoreRevisionAction } from "@/app/admin/product-editor/[campaignId]/actions";
import type { EvidenceFilter, FieldEvidence } from "@/lib/evidence-manager";

const FILTERS: Array<{ id: EvidenceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "importer", label: "Importer only" },
  { id: "manual", label: "Manual only" },
  { id: "research", label: "Research only" },
  { id: "low", label: "Low confidence" },
  { id: "recent", label: "Recently modified" },
];

export function matchesFilter(evidence: FieldEvidence | undefined, filter: EvidenceFilter): boolean {
  if (filter === "all") return true;
  if (!evidence || evidence.revision < 1) return false;
  if (filter === "importer") return evidence.origin === "IMPORTER";
  if (filter === "manual") return evidence.origin === "MANUAL";
  if (filter === "research") return evidence.origin === "RESEARCH";
  if (filter === "low") return ["HEURISTIC_EXTRACTION", "AI_SOURCE_CLASSIFICATION", "UNKNOWN", "NOT_FOUND"].includes(evidence.confidence);
  return evidence.revision > 1;
}

export function EvidenceFilterBar({ value, onChange }: { value: EvidenceFilter; onChange: (filter: EvidenceFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onChange(filter.id)}
          className={
            value === filter.id
              ? "rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950"
              : "rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
          }
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function FieldEvidencePanel({ campaignId, evidence }: { campaignId: number; evidence: FieldEvidence }) {
  const [open, setOpen] = useState<"history" | "evidence" | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <OriginBadge origin={evidence.origin} />
        <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300">{evidence.confidence}</span>
        <span className="text-zinc-500">Revision {evidence.revision || "—"}</span>
        <span className="text-zinc-500">Last modified {evidence.lastModified || "Not recorded"}</span>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" className="text-emerald-300 hover:underline" onClick={() => setOpen("history")}>
          View History
        </button>
        <button type="button" className="text-emerald-300 hover:underline" onClick={() => setOpen("evidence")}>
          View Evidence
        </button>
      </div>
      {open ? (
        <dialog open className="fixed inset-0 z-50 m-auto max-h-[80vh] w-[min(720px,calc(100%-2rem))] overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-4 text-zinc-100">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-medium">{open === "history" ? "Revision history" : "Evidence"}</h4>
            <button type="button" className="text-sm text-zinc-400" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          {open === "evidence" ? <EvidenceBody evidence={evidence} /> : null}
          {open === "history" ? <HistoryBody campaignId={campaignId} evidence={evidence} /> : null}
        </dialog>
      ) : null}
    </div>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const manual = origin === "MANUAL";
  return (
    <span
      className={
        manual
          ? "rounded border border-emerald-500/50 px-1.5 py-0.5 font-medium text-emerald-300"
          : "rounded border border-zinc-600 px-1.5 py-0.5 font-medium text-zinc-300"
      }
    >
      {origin === "IMPORTER" ? "Importer" : origin}
    </span>
  );
}

function EvidenceBody({ evidence }: { evidence: FieldEvidence }) {
  const rows = [
    ["Origin", evidence.origin],
    ["Confidence", evidence.confidence],
    ["Captured at", evidence.capturedAt || "Not recorded"],
    ["Captured by", evidence.capturedBy || "Not recorded"],
    ["Last modified", evidence.lastModified || "Not recorded"],
    ["Status", evidence.status],
    ["Original URL", evidence.source.sourceUrl || "Not recorded"],
    ["Section", evidence.source.section || "Not recorded"],
    ["DOM path", evidence.source.domPath || "Not recorded"],
    ["Import session", evidence.source.importSession || "Not recorded"],
    ["Screenshot", evidence.source.screenshotRef || "Not captured"],
  ];
  return (
    <div className="mt-4 space-y-3 text-sm">
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[9rem_1fr] gap-2">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="break-all text-zinc-200">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-zinc-500">Evidence snippet</p>
        <p className="mt-1 whitespace-pre-wrap text-zinc-200">{evidence.source.snippet || "Not recorded"}</p>
      </div>
    </div>
  );
}

function HistoryBody({ campaignId, evidence }: { campaignId: number; evidence: FieldEvidence }) {
  return (
    <ol className="mt-4 space-y-4">
      {evidence.revisions.map((revision) => (
        <li key={revision.revision} className="rounded-md border border-zinc-800 p-3 text-sm">
          <p className="font-medium">
            Revision {revision.revision} · {revision.origin} · {revision.operation}
          </p>
          <p className="text-zinc-500">
            {revision.lastModified} · {revision.operatorName}
          </p>
          {revision.reason ? <p className="text-zinc-400">Reason: {revision.reason}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-zinc-200">{presentValue(revision.valueJson)}</p>
          <form action={restoreRevisionAction} className="mt-2">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="field" value={evidence.field} />
            <input type="hidden" name="revision" value={revision.revision} />
            <button type="submit" className="text-amber-300 hover:underline">
              Restore Revision
            </button>
          </form>
        </li>
      ))}
    </ol>
  );
}

function presentValue(valueJson: string): string {
  try {
    const parsed = JSON.parse(valueJson) as unknown;
    if (typeof parsed === "string") return parsed || "(empty)";
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") return JSON.stringify(item);
          return String(item);
        })
        .filter(Boolean)
        .join("\n") || "(empty)";
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return valueJson;
  }
}
