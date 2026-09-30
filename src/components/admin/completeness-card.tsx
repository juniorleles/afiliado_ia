"use client";

import type { ImportCompletenessReport, SectionPresence, SectionQuality } from "@/lib/completeness-engine";

const TONE_TEXT = {
  green: "text-emerald-300",
  yellow: "text-amber-300",
  red: "text-red-300",
} as const;

const TONE_BAR = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
} as const;

const QUALITY_TEXT: Record<SectionQuality, string> = {
  GOOD: "text-emerald-300",
  WEAK: "text-amber-300",
  MISSING: "text-red-300",
};

const PRESENCE_TEXT: Record<SectionPresence, string> = {
  AUTO: "text-zinc-300",
  MANUAL: "text-emerald-200",
  MIXED: "text-amber-200",
  EMPTY: "text-zinc-500",
};

export function CompletenessCard({
  report,
  campaignId,
}: {
  report: ImportCompletenessReport;
  campaignId?: number;
}) {
  return (
    <section id="completeness" aria-label="Completeness" className="space-y-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <p className="text-sm text-zinc-400">Current score</p>
        <p className={`mt-1 text-4xl font-semibold ${TONE_TEXT[report.tone]}`}>{report.score}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-800" aria-hidden="true">
          <div className={`h-2 rounded ${TONE_BAR[report.tone]}`} style={{ width: `${report.score}%` }} />
        </div>
        <p className="mt-3 text-sm text-zinc-200">Estimated LP quality: {report.estimatedQuality}</p>
        {report.generationWarning ? <p className="mt-2 text-sm text-amber-200">{report.generationWarning}</p> : null}
        <p className="mt-2 text-sm text-zinc-400">Generation remains available. This report does not block it.</p>
      </div>
      <ActionList title="Highest priority actions" items={report.priorityActions} campaignId={campaignId} />
      <SectionList title="Completed items" sections={report.completed} />
      <SectionList title="Remaining items" sections={report.remaining} />
      <div>
        <p className="text-sm font-medium text-zinc-200">Section quality</p>
        <ul className="mt-2 space-y-2">
          {report.sections.map((section) => (
            <li key={section.id} className="rounded-md border border-zinc-800 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-zinc-100">{section.label}</span>
                <span className="text-xs uppercase tracking-wide text-zinc-400">
                  Target {section.targetLabel}
                </span>
              </div>
              <p className="mt-1 text-zinc-400">
                <span className={PRESENCE_TEXT[section.presence]}>{section.presence}</span>
                <span className="px-2 text-zinc-600">·</span>
                <span className={`font-medium ${QUALITY_TEXT[section.quality]}`}>{section.quality}</span>
                <span className="px-2 text-zinc-600">·</span>
                Found={section.found} Recommended={section.targetLabel}
              </p>
              <p className="text-zinc-500">{section.reason}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActionList({
  title,
  items,
  campaignId,
}: {
  title: string;
  items: ImportCompletenessReport["priorityActions"];
  campaignId?: number;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-emerald-300">No priority actions.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.sectionId}>
              <button
                type="button"
                onClick={() => openSection(item.editorHash, campaignId)}
                className="text-left text-sm text-emerald-300 hover:underline"
              >
                {item.action}
              </button>
              <span className="ml-2 text-sm text-zinc-500">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionList({
  title,
  sections,
}: {
  title: string;
  sections: ImportCompletenessReport["completed"];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {sections.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">None</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {sections.map((section) => (
            <li key={section.id} className="rounded border border-zinc-700 px-2 py-1 text-sm text-zinc-200">
              {section.label}
            </li>
          ))}
        </ul>
      )}
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
