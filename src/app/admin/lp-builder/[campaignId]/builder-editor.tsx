"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BUILDER_GROUPS, type BuilderGroup } from "@/lib/builder-content";
import { fieldPresence, resolveLivePreview, type FieldPresence, type PreviewView, type PreviewViewport } from "@/lib/lp-builder/live-preview";
import { resetBuilderFieldAction, saveBuilderFieldAction } from "@/app/admin/lp-builder/[campaignId]/actions";
import { LivePreviewPane } from "@/components/admin/lp-live-preview";

export type BuilderEditorField = {
  id: string;
  group: BuilderGroup;
  section: string;
  label: string;
  kind: "headline" | "subheadline" | "cta" | "title" | "description" | "long" | "question" | "answer";
  generated: string;
  override: string | null;
  effective: string;
  modified: boolean;
  maxLength: number;
};

export type BuilderAuditItem = {
  id: number;
  fieldId: string;
  sectionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousValue: string | null;
  newValue: string | null;
};

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

const PRESENCE_LABEL: Record<FieldPresence, string> = {
  saved: "Saved",
  modified: "Modified",
  unsaved: "Unsaved",
};

type FilterMode = "all" | "modified" | "unmodified";

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function BuilderEditor({
  campaignId,
  previewHref,
  initialFields,
  initialAudit,
}: {
  campaignId: number;
  previewHref: string;
  initialFields: BuilderEditorField[];
  initialAudit: BuilderAuditItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState(initialFields);
  const [audit, setAudit] = useState(initialAudit);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [view, setView] = useState<PreviewView>("effective");
  const [showHighlights, setShowHighlights] = useState(false);
  const [flashSection, setFlashSection] = useState<BuilderGroup | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const flashTimer = useRef<number | null>(null);

  const effectivePreview = useMemo(
    () => resolveLivePreview({ fields, drafts, view: "effective" }),
    [fields, drafts, refreshToken],
  );
  const generatedPreview = useMemo(
    () => resolveLivePreview({ fields, drafts: {}, view: "generated" }),
    [fields, refreshToken],
  );

  const hasUnsaved = fields.some((field) => fieldPresence(field, drafts[field.id]) === "unsaved");

  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return fields.filter((field) => {
      const presence = fieldPresence(field, drafts[field.id]);
      const changed = presence === "modified" || presence === "unsaved";
      if (filter === "modified" && !changed) return false;
      if (filter === "unmodified" && changed) return false;
      if (!needle) return true;
      const live = effectivePreview.fields.find((item) => item.id === field.id);
      const haystack = [field.label, field.section, field.generated, field.override ?? "", live?.effective ?? ""].join("\n").toLowerCase();
      return haystack.includes(needle);
    });
  }, [fields, filter, query, drafts, effectivePreview.fields]);

  function jump(group: BuilderGroup) {
    setCollapsed((current) => ({ ...current, [group]: false }));
    setFlashSection(group);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashSection(null), 1200);
  }

  function confirmNavigation(event: React.MouseEvent<HTMLElement>) {
    if (!hasUnsaved) return;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (!window.confirm("You have unsaved builder edits. Leave this page?")) event.preventDefault();
  }

  function beginEdit(field: BuilderEditorField) {
    setDrafts((current) => {
      if (Object.prototype.hasOwnProperty.call(current, field.id)) return current;
      return { ...current, [field.id]: field.override ?? field.generated };
    });
  }

  function save(field: BuilderEditorField) {
    const value = drafts[field.id] ?? field.override ?? field.generated;
    if (value === (field.override ?? field.generated)) return;
    startTransition(async () => {
      const result = await saveBuilderFieldAction({ campaignId, fieldId: field.id, value });
      if (!result.ok) {
        setSaveErrors((current) => ({ ...current, [field.id]: result.error }));
        return;
      }
      setSaveErrors((current) => ({ ...current, [field.id]: "" }));
      setFields((current) => current.map((item) => (
        item.id === field.id
          ? { ...item, override: result.value, effective: result.value, modified: true }
          : item
      )));
      setAudit((current) => [result.audit, ...current]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[field.id];
        return next;
      });
    });
  }

  function reset(field: BuilderEditorField) {
    startTransition(async () => {
      const result = await resetBuilderFieldAction({ campaignId, fieldId: field.id });
      if (!result.ok) {
        setSaveErrors((current) => ({ ...current, [field.id]: result.error }));
        return;
      }
      setSaveErrors((current) => ({ ...current, [field.id]: "" }));
      setFields((current) => current.map((item) => (
        item.id === field.id
          ? { ...item, override: null, effective: item.generated, modified: false }
          : item
      )));
      if (result.audit) setAudit((current) => [result.audit!, ...current]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[field.id];
        return next;
      });
    });
  }

  function resetPreview() {
    setDrafts({});
    setSaveErrors({});
    setView("effective");
    setRefreshToken((token) => token + 1);
  }

  return (
    <div className="space-y-6" onClickCapture={confirmNavigation}>
      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)_minmax(360px,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Sections</p>
          <nav className="flex flex-col gap-1">
            {BUILDER_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => jump(group)}
                className="rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
              >
                {GROUP_LABELS[group]}
              </button>
            ))}
          </nav>
          <a href={previewHref} className="block px-3 text-sm text-emerald-400 hover:underline">
            Open full preview
          </a>
        </aside>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search fields"
              aria-label="Search fields"
              className="min-w-48 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <select
              value={filter}
              aria-label="Filter fields"
              onChange={(event) => setFilter(event.target.value as FilterMode)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="modified">Modified</option>
              <option value="unmodified">Unmodified</option>
            </select>
            <button type="button" className="text-sm text-zinc-300 hover:underline" onClick={() => setCollapsed({})}>
              Expand
            </button>
            <button
              type="button"
              className="text-sm text-zinc-300 hover:underline"
              onClick={() => setCollapsed(Object.fromEntries(BUILDER_GROUPS.map((group) => [group, true])))}
            >
              Collapse
            </button>
          </div>
          {hasUnsaved ? <p className="text-sm text-amber-200">Unsaved edits are in the live preview.</p> : null}
          {BUILDER_GROUPS.map((group) => {
            const groupFields = visible.filter((field) => field.group === group);
            if (groupFields.length === 0 && (query.trim() || filter !== "all")) return null;
            const closed = collapsed[group] === true;
            return (
              <section key={group} id={`builder-${group}`} className="rounded-md border border-zinc-800">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setCollapsed((current) => ({ ...current, [group]: !closed }))}
                >
                  <span className="font-medium">{GROUP_LABELS[group]}</span>
                  <span className="text-xs text-zinc-500">{closed ? "Expand" : "Collapse"}</span>
                </button>
                {closed ? null : (
                  <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
                    {groupFields.length === 0 ? <p className="text-sm text-zinc-500">No generated text in this section.</p> : null}
                    {groupFields.map((field) => {
                      const editing = Object.prototype.hasOwnProperty.call(drafts, field.id);
                      const draft = editing ? drafts[field.id] ?? "" : field.override ?? "";
                      const live = effectivePreview.fields.find((item) => item.id === field.id);
                      const effective = live?.effective ?? field.effective;
                      const presence = fieldPresence(field, drafts[field.id]);
                      const message = effectivePreview.errors[field.id] || saveErrors[field.id];
                      return (
                        <article
                          key={field.id}
                          data-field-id={field.id}
                          data-presence={presence}
                          data-modified={field.modified ? "true" : "false"}
                          className={`space-y-2 rounded-md border p-3 ${presence === "unsaved" ? "border-sky-500/80 bg-sky-950/20" : field.modified ? "border-amber-500/80 bg-amber-950/20" : "border-zinc-800"}`}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-medium text-zinc-100">{field.label}</h3>
                            <p className="text-xs text-zinc-400">{PRESENCE_LABEL[presence]}</p>
                          </div>
                          <label className="block text-xs text-zinc-500">
                            Generated value
                            <textarea readOnly value={field.generated} rows={2} className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400" />
                          </label>
                          <label className="block text-xs text-zinc-500">
                            Builder override
                            <textarea
                              value={draft}
                              readOnly={!editing}
                              maxLength={field.maxLength}
                              rows={3}
                              aria-label={`${field.label} override`}
                              onFocus={() => beginEdit(field)}
                              onChange={(event) => setDrafts((current) => ({ ...current, [field.id]: event.target.value }))}
                              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                            />
                          </label>
                          <label className="block text-xs text-zinc-500">
                            Effective value
                            <textarea readOnly value={effective} rows={2} className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
                          </label>
                          {message ? <p className="text-sm text-red-300">{message}</p> : null}
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm" onClick={() => beginEdit(field)}>
                              Edit
                            </button>
                            <button type="button" disabled={!editing || pending} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-40" onClick={() => save(field)}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm"
                              onClick={() => {
                                setDrafts((current) => {
                                  const next = { ...current };
                                  delete next[field.id];
                                  return next;
                                });
                                setSaveErrors((current) => ({ ...current, [field.id]: "" }));
                              }}
                            >
                              Cancel
                            </button>
                            <button type="button" disabled={!field.modified || pending} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40" onClick={() => reset(field)}>
                              Reset
                            </button>
                            <button type="button" className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm" onClick={() => void copyText(field.generated).then((ok) => setCopied(ok ? `${field.id}:generated` : ""))}>
                              Copy generated
                            </button>
                            <button type="button" className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm" onClick={() => void copyText(effective).then((ok) => setCopied(ok ? `${field.id}:effective` : ""))}>
                              Copy effective
                            </button>
                            {copied.startsWith(`${field.id}:`) ? <span className="self-center text-xs text-emerald-300">Copied</span> : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div id="lp-live-preview" className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Live Preview</p>
        <LivePreviewPane
          effective={effectivePreview}
          generated={generatedPreview}
          view={view}
          viewport={viewport}
          showHighlights={showHighlights}
          flashSection={flashSection}
          refreshToken={refreshToken}
          onView={setView}
          onViewport={setViewport}
          onHighlights={setShowHighlights}
          onRefresh={() => setRefreshToken((token) => token + 1)}
          onReset={resetPreview}
        />
        </div>
      </div>
      <section className="rounded-md border border-zinc-800 p-4">
        <h3 className="text-sm font-medium">Audit</h3>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No content edits yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-xs text-zinc-300">
            {audit.slice(0, 20).map((row) => (
              <li key={`${row.id}-${row.updatedAt}-${row.version}`} className="rounded-md border border-zinc-800 px-3 py-2">
                <p>
                  {row.sectionId} · {row.fieldId} · v{row.version}
                </p>
                <p className="text-zinc-500">
                  {row.createdBy} created {row.createdAt} · {row.updatedBy} updated {row.updatedAt}
                </p>
                <p className="mt-1 text-zinc-400">Previous: {row.previousValue ?? "—"}</p>
                <p className="text-zinc-200">New: {row.newValue ?? "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
