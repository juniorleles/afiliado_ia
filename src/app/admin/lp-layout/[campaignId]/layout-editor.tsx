"use client";

import { useMemo, useState, useTransition } from "react";
import { resetLayoutAction, saveLayoutAction } from "@/app/admin/lp-layout/[campaignId]/actions";
import {
  LAYOUT_LABELS,
  LAYOUT_PRESETS,
  MANDATORY_SECTIONS,
  applyPreset,
  assignmentsFrom,
  duplicateSection,
  insertSection,
  moveSection,
  resolveLayout,
  withFlag,
  type LayoutAssignment,
  type LayoutPreset,
  type LayoutSectionState,
} from "@/lib/lp-builder/layout";

export type LayoutAuditItem = {
  id: number;
  sectionKey: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousPosition: number | null;
  newPosition: number | null;
  visibilityChange: string | null;
};

const PRESET_LABELS: Record<LayoutPreset, string> = {
  generated: "Generated layout",
  editorial: "Editorial layout",
  sales: "Sales layout",
  compact: "Compact layout",
  longForm: "Long-form layout",
};

export function LayoutEditor({
  campaignId,
  generated,
  initial,
  snippets,
  initialAudit,
}: {
  campaignId: number;
  generated: LayoutSectionState[];
  initial: LayoutSectionState[];
  snippets: Record<string, string>;
  initialAudit: LayoutAuditItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [sections, setSections] = useState(initial);
  const [saved, setSaved] = useState<LayoutAssignment[]>(assignmentsFrom(generated, initial));
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? "hero");
  const [targetId, setTargetId] = useState(initial[1]?.id ?? "features");
  const [audit, setAudit] = useState(initialAudit);
  const resolved = useMemo(() => resolveLayout({ generated, assignments: assignmentsFrom(generated, sections) }), [generated, sections]);
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];

  function commit(next: LayoutSectionState[]) {
    setSections(next);
    const assignments = assignmentsFrom(generated, next);
    startTransition(async () => {
      const result = await saveLayoutAction({ campaignId, assignments });
      if (!result.ok) return;
      setSaved(assignments);
      if (result.audit) setAudit((current) => [result.audit!, ...current]);
    });
  }

  function reset(sectionKey?: string) {
    startTransition(async () => {
      const result = await resetLayoutAction({ campaignId, sectionKey });
      if (!result.ok) return;
      const remaining = sectionKey ? saved.filter((row) => row.sectionKey !== sectionKey) : [];
      const next = resolveLayout({ generated, assignments: remaining }).sections.filter((section) => !section.duplicate || remaining.some((row) => row.sectionKey === section.id));
      setSaved(remaining);
      setSections(sectionKey ? next : generated.map((section) => ({ ...section })));
      if (result.audit) setAudit((current) => [result.audit!, ...current]);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {LAYOUT_PRESETS.map((preset) => (
            <button key={preset} type="button" disabled={pending} onClick={() => commit(applyPreset(generated, sections, preset))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <ul className="max-h-72 space-y-1 overflow-auto rounded-md border border-zinc-800 p-2">
          {resolved.sections.map((section) => (
            <li key={section.id} data-preview-section={section.sectionId}>
              <button type="button" onClick={() => setSelectedId(section.id)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${section.id === selected?.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"}`}>
                <span>{section.label}{section.duplicate ? " · copy" : ""}</span>
                <span className="text-xs text-zinc-500">{section.visible ? "Visible" : "Hidden"}{section.collapsed ? " · Collapsed" : " · Expanded"}{section.pinned ? " · Pinned" : ""}{section.locked ? " · Locked" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="space-y-3 rounded-md border border-zinc-800 p-4">
            <p className="text-sm text-zinc-300">Order {selected.order} · Priority {selected.priority}{selected.futureCompatible ? " · Future compatible" : ""}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending || selected.locked} onClick={() => commit(moveSection(sections, selected.id, -1))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Move up</button>
              <button type="button" disabled={pending || selected.locked} onClick={() => commit(moveSection(sections, selected.id, 1))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Move down</button>
              <button type="button" disabled={pending} onClick={() => commit(withFlag(sections, selected.id, { visible: false }))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Hide section</button>
              <button type="button" disabled={pending} onClick={() => commit(withFlag(sections, selected.id, { visible: true }))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Show section</button>
              <button type="button" disabled={pending} onClick={() => commit(withFlag(sections, selected.id, { collapsed: true }))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Collapse</button>
              <button type="button" disabled={pending} onClick={() => commit(withFlag(sections, selected.id, { collapsed: false }))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Expand</button>
              <button type="button" disabled={pending || selected.locked} onClick={() => commit(duplicateSection(sections, selected.id))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Duplicate section</button>
              <button type="button" disabled={pending} onClick={() => reset(selected.id)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Delete override</button>
              <button type="button" disabled={pending} onClick={() => reset(selected.id)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Reset section layout</button>
              <button type="button" disabled={pending} onClick={() => { if (window.confirm("Restore the generated layout?")) reset(); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Restore generated layout</button>
              <button type="button" disabled={pending} onClick={() => { if (window.confirm("Reset the entire layout?")) reset(); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Reset entire layout</button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-zinc-500">
                Insert relative to
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                </select>
              </label>
              <button type="button" disabled={pending || selected.locked} onClick={() => commit(insertSection(sections, selected.id, targetId, "before"))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Insert before</button>
              <button type="button" disabled={pending || selected.locked} onClick={() => commit(insertSection(sections, selected.id, targetId, "after"))} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Insert after</button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <label className="flex items-center gap-2"><input type="checkbox" checked={selected.pinned} onChange={(event) => commit(withFlag(sections, selected.id, { pinned: event.target.checked }))} />Pinned</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={selected.locked} onChange={(event) => commit(withFlag(sections, selected.id, { locked: event.target.checked }))} />Locked</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={selected.futureCompatible} onChange={(event) => commit(withFlag(sections, selected.id, { futureCompatible: event.target.checked }))} />Future compatible</label>
              <label className="text-xs text-zinc-500">
                Display priority
                <input type="number" value={selected.priority} onChange={(event) => commit(withFlag(sections, selected.id, { priority: Number(event.target.value) }))} className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
              </label>
            </div>
            {(MANDATORY_SECTIONS as readonly string[]).includes(selected.sectionId) && !selected.visible ? (
              <p className="text-sm text-amber-200" role="status">{LAYOUT_LABELS[selected.sectionId]} is required. Hiding it leaves the generated section in place and only changes presentation.</p>
            ) : null}
          </div>
        ) : null}
        {resolved.warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-200" role="status">
            {resolved.warnings.map((warning) => <li key={warning.sectionKey}>{warning.message}</li>)}
          </ul>
        ) : null}
        <section className="rounded-md border border-zinc-800 p-4">
          <h3 className="text-sm font-medium">Layout audit</h3>
          {audit.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No layout edits yet.</p> : (
            <ul className="mt-3 space-y-2 text-xs text-zinc-300">
              {audit.slice(0, 12).map((row) => (
                <li key={`${row.id}-${row.updatedAt}`} className="rounded-md border border-zinc-800 px-3 py-2">
                  <p>{row.sectionKey} · v{row.version}</p>
                  <p className="text-zinc-500">{row.updatedBy} updated {row.updatedAt}</p>
                  <p>Position {row.previousPosition ?? "—"} → {row.newPosition ?? "—"}</p>
                  <p>Visibility {row.visibilityChange || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="xl:sticky xl:top-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Live preview</p>
        <div data-layout-preview="1" className="max-h-[80vh] space-y-3 overflow-auto rounded-md border border-zinc-700 p-3">
          {resolved.sections.filter((section) => section.visible).map((section) => (
            <section key={section.id} data-preview-section={section.id} className="rounded-md border border-zinc-800 p-3">
              <h2 className="text-sm font-medium">{section.label}</h2>
              {section.collapsed ? null : <p className="mt-2 text-sm text-zinc-300">{snippets[section.sectionId] || "Section"}</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
