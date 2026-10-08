"use client";

import { useMemo, useState, useTransition } from "react";
import { resetMediaAction, saveLibraryAction, saveMediaAction } from "@/app/admin/lp-media/[campaignId]/actions";
import {
  MEDIA_LABELS,
  MEDIA_ORIGINS,
  MEDIA_ROLES,
  duplicateFields,
  mediaFormat,
  previewAssignments,
  presentationSrc,
  reorderSlots,
  resolveMedia,
  type MediaAssignment,
  type MediaDraft,
  type MediaFields,
  type MediaOrigin,
  type MediaRole,
  type MediaSlot,
} from "@/lib/lp-builder/media";

export type MediaAuditItem = {
  id: number;
  slotId: string;
  libraryId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  originalAsset: string | null;
  replacementAsset: string | null;
  reason: string;
};

export type MediaLibraryItem = MediaFields & { libraryId: string };

const CROP_POSITIONS = new Set(["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"]);

function assignmentOf(slot: MediaSlot, fields: MediaFields, removed: boolean, reason: string): MediaAssignment {
  return { slotId: slot.id, removed, reason, fields };
}

export function MediaEditor({
  campaignId,
  initialSlots,
  saved,
  library,
  initialAudit,
}: {
  campaignId: number;
  initialSlots: MediaSlot[];
  saved: MediaAssignment[];
  library: MediaLibraryItem[];
  initialAudit: MediaAuditItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [slots, setSlots] = useState(initialSlots);
  const [stored, setStored] = useState(saved);
  const [assets, setAssets] = useState(library);
  const [drafts, setDrafts] = useState<Record<string, MediaDraft>>({});
  const [audit, setAudit] = useState(initialAudit);
  const [selectedId, setSelectedId] = useState(initialSlots[0]?.id ?? "heroImage");
  const [checked, setChecked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<MediaRole | "">("");
  const [originFilter, setOriginFilter] = useState<MediaOrigin | "">("");
  const [reason, setReason] = useState("replace");

  const preview = useMemo(() => previewAssignments(slots, stored, drafts), [slots, stored, drafts]);
  const resolved = useMemo(() => resolveMedia({ slots, assignments: preview }), [slots, preview]);
  const selected = resolved.slots.find((slot) => slot.slot.id === selectedId) ?? resolved.slots[0];

  const visible = resolved.slots.filter((slot) => {
    if (roleFilter && slot.slot.role !== roleFilter) return false;
    if (originFilter && slot.origin !== originFilter) return false;
    const haystack = `${slot.slot.label} ${slot.effective.name} ${slot.effective.alt} ${slot.effective.src}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  function updateDraft(slotId: string, patch: MediaDraft) {
    setDrafts((current) => {
      const previous = current[slotId] ?? {};
      return { ...current, [slotId]: { ...previous, ...patch, fields: { ...previous.fields, ...patch.fields } } };
    });
  }

  function remember(nextAudit: MediaAuditItem | null | undefined) {
    if (nextAudit) setAudit((current) => [nextAudit, ...current]);
  }

  function persist(slot: NonNullable<typeof selected>, nextReason: string, removed = false) {
    const fields = removed ? { ...slot.effective, src: "" } : slot.effective;
    startTransition(async () => {
      const result = await saveMediaAction({
        campaignId,
        slotId: slot.slot.id,
        removed,
        reason: nextReason,
        fields,
        originalAsset: slot.slot.generated.src,
      });
      if (!result.ok) return;
      setStored((current) => [...current.filter((row) => row.slotId !== slot.slot.id), assignmentOf(slot.slot, result.row.fields, result.row.removed, result.row.reason)]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.slot.id];
        return next;
      });
      remember(result.audit);
    });
  }

  function reset(slotIds: string[] | undefined, nextReason: string) {
    startTransition(async () => {
      const result = await resetMediaAction({ campaignId, slotIds, reason: nextReason });
      if (!result.ok) return;
      setStored((current) => slotIds ? current.filter((row) => !slotIds.includes(row.slotId)) : []);
      setDrafts((current) => {
        if (!slotIds) return {};
        const next = { ...current };
        for (const slotId of slotIds) delete next[slotId];
        return next;
      });
      remember(result.audit);
    });
  }

  function useLibrary(item: MediaLibraryItem) {
    if (!selected) return;
    updateDraft(selected.slot.id, {
      removed: false,
      reason: "replace",
      fields: { ...item, order: selected.effective.order },
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs text-zinc-500">
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
          </label>
          <label className="text-xs text-zinc-500">
            Filter role
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as MediaRole | "")} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              <option value="">All roles</option>
              {MEDIA_ROLES.map((role) => <option key={role} value={role}>{MEDIA_LABELS[role]}</option>)}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Filter origin
            <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as MediaOrigin | "")} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              <option value="">All origins</option>
              {MEDIA_ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
            </select>
          </label>
        </div>
        <ul className="max-h-64 space-y-1 overflow-auto rounded-md border border-zinc-800 p-2">
          {visible.map((slot) => (
            <li key={slot.slot.id}>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${slot.slot.id === selected?.slot.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"}`}>
                <input type="checkbox" checked={checked.includes(slot.slot.id)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, slot.slot.id] : current.filter((id) => id !== slot.slot.id))} />
                <button type="button" onClick={() => setSelectedId(slot.slot.id)} className="flex-1 text-left">
                  {slot.slot.label}
                  <span className="ml-2 text-xs text-zinc-500">{slot.origin}{slot.override ? " · override" : ""}</span>
                </button>
              </label>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="space-y-3 rounded-md border border-zinc-800 p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => persist(selected, reason || "replace")} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-40">Replace</button>
              <button type="button" disabled={pending} onClick={() => { updateDraft(selected.slot.id, { removed: true, reason: "remove" }); persist({ ...selected, effective: { ...selected.effective, src: "" } }, "remove", true); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Remove</button>
              <button type="button" disabled={pending} onClick={() => reset([selected.slot.id], "restore-generated")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Restore generated</button>
              <button type="button" disabled={pending} onClick={() => reset(slots.filter((slot) => slot.section === selected.slot.section).map((slot) => slot.id), "reset-section")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Reset section</button>
              <button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove every media override?")) reset(undefined, "reset-all"); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Reset all media</button>
              <button type="button" disabled={pending} onClick={() => reset(undefined, "restore-generated")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Restore generated media</button>
              <button type="button" disabled={pending} onClick={() => { const next = reorderSlots(slots, selected.slot.id, -1); setSlots(next); updateDraft(selected.slot.id, { reason: "reorder", fields: { order: next.find((slot) => slot.id === selected.slot.id)?.generated.order } }); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Move earlier</button>
              <button type="button" disabled={pending} onClick={() => { const next = reorderSlots(slots, selected.slot.id, 1); setSlots(next); updateDraft(selected.slot.id, { reason: "reorder", fields: { order: next.find((slot) => slot.id === selected.slot.id)?.generated.order } }); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Move later</button>
            </div>
            <label className="block text-xs text-zinc-500">
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
            </label>
            <label className="block text-xs text-zinc-500">
              Name
              <input value={selected.effective.name} onChange={(event) => updateDraft(selected.slot.id, { fields: { name: event.target.value } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
            </label>
            <label className="block text-xs text-zinc-500">
              Image address
              <input value={selected.effective.src} onChange={(event) => updateDraft(selected.slot.id, { removed: false, fields: { src: event.target.value, format: mediaFormat(event.target.value), origin: selected.effective.origin === "generated" ? "saved" : selected.effective.origin, source: event.target.value || selected.effective.source } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
            </label>
            <label className="block text-xs text-zinc-500">
              Upload
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif" className="mt-1 block text-sm" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const src = typeof reader.result === "string" ? reader.result : "";
                  updateDraft(selected.slot.id, { removed: false, fields: { src, name: file.name, format: mediaFormat(src), bytes: file.size, origin: "uploaded", source: "upload" } });
                };
                reader.readAsDataURL(file);
              }} />
            </label>
            <label className="block text-xs text-zinc-500">
              Alt text
              <input value={selected.effective.alt} onChange={(event) => updateDraft(selected.slot.id, { fields: { alt: event.target.value } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
            </label>
            <label className="block text-xs text-zinc-500">
              Caption
              <input value={selected.effective.caption} onChange={(event) => updateDraft(selected.slot.id, { fields: { caption: event.target.value } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={selected.effective.decorative} onChange={(event) => updateDraft(selected.slot.id, { fields: { decorative: event.target.checked } })} />
              Decorative
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-zinc-500">
                Image role
                <select value={selected.effective.role} onChange={(event) => updateDraft(selected.slot.id, { fields: { role: event.target.value as MediaRole } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  {MEDIA_ROLES.map((role) => <option key={role} value={role}>{MEDIA_LABELS[role]}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-500">
                Origin
                <select value={selected.effective.origin} onChange={(event) => updateDraft(selected.slot.id, { fields: { origin: event.target.value as MediaOrigin } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  {MEDIA_ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-500">
                Crop reference
                <input value={selected.effective.crop} onChange={(event) => updateDraft(selected.slot.id, { reason: "crop", fields: { crop: event.target.value } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
              </label>
              <label className="text-xs text-zinc-500">
                Rotation
                <input type="number" value={selected.effective.rotation} onChange={(event) => updateDraft(selected.slot.id, { reason: "rotate", fields: { rotation: Number(event.target.value) } })} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
              </label>
            </div>
            <p className="text-xs text-zinc-500">Source {selected.source || "generated"} · Effective {selected.effective.src ? "assigned" : "empty"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => persist(selected, "rename")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Rename</button>
              <button type="button" disabled={pending} onClick={() => persist(selected, "crop")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Save crop reference</button>
              <button type="button" disabled={pending} onClick={() => persist(selected, "rotate")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Save rotation</button>
              <button type="button" disabled={pending} onClick={() => {
                const libraryId = `library-${selected.slot.id}-${assets.length + 1}`;
                const fields = duplicateFields(selected.effective, `${selected.effective.name} copy`);
                startTransition(async () => {
                  const result = await saveLibraryAction({ campaignId, libraryId, fields, reason: "duplicate" });
                  if (!result.ok) return;
                  setAssets((current) => [...current, { ...result.row }]);
                  remember(result.audit);
                });
              }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Duplicate</button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || checked.length === 0 || !selected} onClick={() => {
            if (!selected) return;
            const fields = selected.effective;
            for (const slotId of checked) updateDraft(slotId, { removed: false, reason: "bulk-replace", fields });
            startTransition(async () => {
              for (const slotId of checked) {
                const slot = slots.find((item) => item.id === slotId);
                if (!slot) continue;
                const result = await saveMediaAction({ campaignId, slotId, removed: false, reason: "bulk-replace", fields: { ...fields, order: slot.generated.order }, originalAsset: slot.generated.src });
                if (!result.ok) continue;
                setStored((current) => [...current.filter((row) => row.slotId !== slotId), { slotId, removed: false, reason: result.row.reason, fields: result.row.fields }]);
                remember(result.audit);
              }
              setDrafts((current) => {
                const next = { ...current };
                for (const slotId of checked) delete next[slotId];
                return next;
              });
            });
          }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Bulk replace with current</button>
          <button type="button" disabled={pending || checked.length === 0} onClick={() => reset(checked, "bulk-reset")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Bulk reset</button>
        </div>
        <section className="rounded-md border border-zinc-800 p-4">
          <h3 className="text-sm font-medium">Saved assets</h3>
          {assets.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No saved assets yet.</p> : (
            <ul className="mt-3 space-y-2 text-sm">
              {assets.map((item) => (
                <li key={item.libraryId} className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2">
                  <span>{item.name} · {item.origin}</span>
                  <button type="button" onClick={() => useLibrary(item)} className="text-emerald-400 hover:underline">Use</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {resolved.warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-200" role="status">
            {resolved.warnings.slice(0, 8).map((warning) => <li key={`${warning.slotId}-${warning.code}`}>{warning.message}</li>)}
          </ul>
        ) : null}
        <section className="rounded-md border border-zinc-800 p-4">
          <h3 className="text-sm font-medium">Media audit</h3>
          {audit.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No media edits yet.</p> : (
            <ul className="mt-3 space-y-2 text-xs text-zinc-300">
              {audit.slice(0, 12).map((row) => (
                <li key={`${row.id}-${row.updatedAt}`} className="rounded-md border border-zinc-800 px-3 py-2">
                  <p>{row.slotId} · v{row.version} · {row.reason}</p>
                  <p className="text-zinc-500">{row.updatedBy} updated {row.updatedAt}</p>
                  <p>Original: {row.originalAsset ?? "—"}</p>
                  <p>Replacement: {row.replacementAsset ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="xl:sticky xl:top-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Live preview</p>
        <div data-media-preview="1" className="max-h-[80vh] space-y-3 overflow-auto rounded-md border border-zinc-700 p-3">
          {[...resolved.slots].sort((a, b) => a.effective.order - b.effective.order || a.slot.id.localeCompare(b.slot.id)).map((slot) => {
            const src = presentationSrc(slot.effective.src);
            const position = CROP_POSITIONS.has(slot.effective.crop.trim().toLowerCase()) ? slot.effective.crop : "center";
            return (
              <figure key={slot.slot.id} data-preview-slot={slot.slot.id} data-preview-section={slot.slot.section} className="rounded-md border border-zinc-800 p-3">
                <figcaption className="text-xs uppercase tracking-wide text-zinc-500">{slot.slot.label}</figcaption>
                {src ? (
                  <img src={src} alt={slot.effective.decorative ? "" : slot.effective.alt} className="mt-2 max-h-40 w-full object-contain" style={{ transform: `rotate(${slot.effective.rotation}deg)`, objectPosition: position }} />
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">No image</p>
                )}
                {slot.effective.caption ? <p className="mt-2 text-sm text-zinc-300">{slot.effective.caption}</p> : null}
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}
