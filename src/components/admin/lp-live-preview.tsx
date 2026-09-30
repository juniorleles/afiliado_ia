"use client";

import { useEffect, useRef } from "react";
import { BUILDER_GROUPS, type BuilderGroup } from "@/lib/builder-content";
import {
  PREVIEW_VIEWPORTS,
  PREVIEW_VIEWPORT_WIDTH,
  type PreviewView,
  type PreviewViewport,
  type LivePreviewResult,
} from "@/lib/lp-builder/live-preview";
import type { ResolvedContentField } from "@/lib/lp-builder/content";

const GROUP_LABELS: Record<BuilderGroup, string> = {
  hero: "Hero",
  features: "Features",
  ingredients: "Ingredients",
  pricing: "Pricing",
  faq: "FAQ",
  guarantee: "Guarantee",
  warnings: "Warnings",
  manufacturer: "Manufacturer",
  footer: "Footer",
};

function PreviewDocument({
  fields,
  showHighlights,
  flashSection,
}: {
  fields: ResolvedContentField[];
  showHighlights: boolean;
  flashSection: BuilderGroup | null;
}) {
  return (
    <article className="space-y-8 px-6 py-8 text-zinc-900">
      {BUILDER_GROUPS.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        if (groupFields.length === 0) return null;
        const flashing = flashSection === group;
        return (
          <section
            key={group}
            data-preview-section={group}
            className={`scroll-mt-4 space-y-2 ${flashing ? "rounded-md ring-2 ring-emerald-500" : ""}`}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{GROUP_LABELS[group]}</h2>
            {groupFields.map((field) => {
              const changed = showHighlights && field.effective !== field.generated;
              const text = field.effective;
              if (!text) return null;
              const className = changed ? "rounded-sm bg-amber-100 px-1" : undefined;
              if (field.kind === "headline") {
                return (
                  <h1 key={field.id} data-preview-field={field.id} className={`text-3xl font-semibold leading-tight ${className ?? ""}`}>
                    {text}
                  </h1>
                );
              }
              if (field.kind === "cta") {
                return (
                  <p key={field.id}>
                    <span data-preview-field={field.id} className={`inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white ${className ?? ""}`}>
                      {text}
                    </span>
                  </p>
                );
              }
              if (field.kind === "title" || field.id.endsWith(".title") || field.id.endsWith(".question")) {
                return (
                  <h3 key={field.id} data-preview-field={field.id} className={`text-lg font-medium ${className ?? ""}`}>
                    {text}
                  </h3>
                );
              }
              return (
                <p key={field.id} data-preview-field={field.id} className={`whitespace-pre-wrap leading-relaxed ${className ?? ""}`}>
                  {text}
                </p>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

export function LivePreviewPane({
  effective,
  generated,
  view,
  viewport,
  showHighlights,
  flashSection,
  refreshToken,
  onView,
  onViewport,
  onHighlights,
  onRefresh,
  onReset,
}: {
  effective: LivePreviewResult;
  generated: LivePreviewResult;
  view: PreviewView;
  viewport: PreviewViewport;
  showHighlights: boolean;
  flashSection: BuilderGroup | null;
  refreshToken: number;
  onView: (view: PreviewView) => void;
  onViewport: (viewport: PreviewViewport) => void;
  onHighlights: (value: boolean) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const errorCount = Object.keys(effective.errors).length;

  useEffect(() => {
    if (!flashSection) return;
    const node = scroller.current?.querySelector(`[data-preview-section="${flashSection}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [flashSection, refreshToken, view]);

  const width = PREVIEW_VIEWPORT_WIDTH[viewport];
  const frames = view === "compare"
    ? [
        { label: "Generated", result: generated },
        { label: "Effective", result: effective },
      ]
    : [{ label: view === "generated" ? "Generated" : "Effective", result: view === "generated" ? generated : effective }];

  return (
    <div className="space-y-3 xl:sticky xl:top-4">
      <div className="flex flex-wrap gap-2">
        {PREVIEW_VIEWPORTS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={viewport === item}
            onClick={() => onViewport(item)}
            className={`rounded-md border px-2 py-1 text-xs capitalize ${viewport === item ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRefresh} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Refresh preview
        </button>
        <button type="button" onClick={onReset} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Reset preview
        </button>
        <button type="button" aria-pressed={view === "compare"} onClick={() => onView(view === "compare" ? "effective" : "compare")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Compare generated vs effective
        </button>
        <button type="button" aria-pressed={view === "generated"} onClick={() => onView("generated")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Toggle generated
        </button>
        <button type="button" aria-pressed={view === "effective"} onClick={() => onView("effective")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Toggle effective
        </button>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={showHighlights} onChange={(event) => onHighlights(event.target.checked)} />
          Show override highlights
        </label>
      </div>
      {errorCount > 0 ? (
        <p className="text-xs text-amber-200" role="status">
          The preview is still showing the last valid text.
        </p>
      ) : null}
      <div ref={scroller} data-live-preview="1" data-preview-viewport={viewport} className="max-h-[80vh] overflow-auto rounded-md border border-zinc-700 bg-zinc-900 p-3">
        <div className={view === "compare" ? "flex gap-3" : ""}>
          {frames.map((frame) => (
            <div key={`${frame.label}-${refreshToken}`} style={{ width }} className="shrink-0 bg-white">
              {view === "compare" ? <p className="px-6 pt-4 text-xs uppercase tracking-wide text-zinc-500">{frame.label}</p> : null}
              <PreviewDocument fields={frame.result.fields} showHighlights={showHighlights && frame.label !== "Generated"} flashSection={flashSection} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
