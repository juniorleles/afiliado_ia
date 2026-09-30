"use client";

import { useState } from "react";
import {
  savePresentationAction,
  resetPresentationAction,
} from "@/app/admin/product-editor/[campaignId]/actions";
import { LiveEditorForm, useCompletenessAssistant, useLiveFieldDraft } from "@/components/admin/completeness-assistant";
import {
  MANAGED_SECTIONS,
  buildLayerCard,
  defaultNavLabels,
  defaultSectionOrder,
  defaultVisibility,
  type LayerCard,
  type ManagedSectionId,
} from "@/lib/editor-layers";

export type PresentationFormState = {
  headline: string | null;
  subheadline: string | null;
  shipping: string | null;
  returns: string | null;
  bonus: string | null;
  images: string | null;
  disclosure: string | null;
  footer: string | null;
  navigation: Record<ManagedSectionId, string> | null;
  visibility: Record<ManagedSectionId, boolean> | null;
  order: ManagedSectionId[] | null;
  ctaColor: string | null;
  imported: {
    headline: string;
    subheadline: string;
    shipping: string;
    returns: string;
    bonus: string;
    images: string;
    disclosure: string;
    footer: string;
  };
};

const inputClass = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100";

const TEXT_FIELDS: Array<{ field: keyof PresentationFormState; presentation: string; label: string; section: string; list?: boolean }> = [
  { field: "headline", presentation: "presentation.headline", label: "Headline", section: "navigation" },
  { field: "subheadline", presentation: "presentation.subheadline", label: "Subheadline", section: "navigation" },
  { field: "shipping", presentation: "presentation.shipping", label: "Shipping", section: "pricing" },
  { field: "returns", presentation: "presentation.returns", label: "Returns", section: "pricing" },
  { field: "bonus", presentation: "presentation.bonus", label: "Bonus", section: "pricing" },
  { field: "images", presentation: "presentation.images", label: "Images", section: "overview" },
  { field: "disclosure", presentation: "presentation.disclosure", label: "Disclosure", section: "footer" },
  { field: "footer", presentation: "presentation.footer", label: "Footer", section: "footer" },
];

export function PresentationEditor({ campaignId, state }: { campaignId: number; state: PresentationFormState }) {
  return (
    <div className="space-y-6">
      <SectionManager campaignId={campaignId} state={state} />
      {TEXT_FIELDS.map((item) => {
        const override = textValue(state[item.field]);
        const imported = state.imported[item.field as keyof PresentationFormState["imported"]] ?? "";
        const card = buildLayerCard({
          field: item.presentation,
          sectionId: item.section,
          label: item.label,
          importedText: imported,
          overrideText: override,
          confidence: override === null ? "NOT_FOUND" : "MANUAL",
          origin: override === null ? "IMPORTER" : "MANUAL",
          source: override === null ? "AUTO" : "MANUAL",
        });
        return (
          <PresentationText
            key={item.presentation}
            campaignId={campaignId}
            field={item.presentation}
            section={item.section}
            card={card}
          />
        );
      })}
    </div>
  );
}

function textValue(value: PresentationFormState[keyof PresentationFormState]): string | null {
  return typeof value === "string" ? value : null;
}

function PresentationText({
  campaignId,
  field,
  section,
  card,
}: {
  campaignId: number;
  field: string;
  section: string;
  card: LayerCard;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.overrideText ?? "");
  const assistant = useCompletenessAssistant();
  useLiveFieldDraft(field, draft, card.importedText, false, editing);
  return (
    <section id={card.field} className="scroll-mt-8 space-y-3 rounded-md border border-zinc-800 p-4">
      <LayerReadout card={card} />
      {editing ? (
        <LiveEditorForm action={savePresentationAction} field={field} className="space-y-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="section" value={section} />
          <textarea name="value" value={draft} rows={3} onChange={(event) => setDraft(event.target.value)} className={inputClass} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                assistant?.revert(field);
                setDraft(card.overrideText ?? "");
                setEditing(false);
              }}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </LiveEditorForm>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200">
          Edit
        </button>
      )}
      {card.overrideText !== null ? (
        <form action={resetPresentationAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="section" value={section} />
          <button type="submit" className="text-sm text-amber-300 hover:underline">
            Reset Override
          </button>
        </form>
      ) : null}
    </section>
  );
}

function SectionManager({ campaignId, state }: { campaignId: number; state: PresentationFormState }) {
  const [order, setOrder] = useState<ManagedSectionId[]>(state.order ?? defaultSectionOrder());
  const [visibility, setVisibility] = useState(state.visibility ?? defaultVisibility());
  const [labels, setLabels] = useState(state.navigation ?? defaultNavLabels());
  const [color, setColor] = useState(state.ctaColor ?? "");

  function move(id: ManagedSectionId, direction: -1 | 1) {
    const index = order.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= order.length) return;
    const copy = [...order];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    setOrder(copy);
  }

  return (
    <section id="section-management" className="space-y-4 rounded-md border border-zinc-800 p-4">
      <h3 className="text-lg font-medium">Section visibility and order</h3>
      <p className="text-sm text-zinc-400">These settings change the preview overlay only. Imported ProductFacts stay unchanged.</p>
      <ol className="space-y-2">
        {order.map((id) => {
          const section = MANAGED_SECTIONS.find((item) => item.id === id);
          if (!section) return null;
          return (
            <li key={id} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={visibility[id]}
                  onChange={(event) => setVisibility({ ...visibility, [id]: event.target.checked })}
                />
                {visibility[id] ? "Show" : "Hide"}
              </label>
              <input
                value={labels[id]}
                onChange={(event) => setLabels({ ...labels, [id]: event.target.value })}
                className="min-w-40 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                aria-label={`Navigation label for ${section.label}`}
              />
              <button type="button" onClick={() => move(id, -1)} className="text-sm text-zinc-300 hover:underline">
                Up
              </button>
              <button type="button" onClick={() => move(id, 1)} className="text-sm text-zinc-300 hover:underline">
                Down
              </button>
            </li>
          );
        })}
      </ol>
      <label className="block text-sm text-zinc-300">
        Custom button color
        <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#0f766e" className={`${inputClass} mt-1`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <StructuredSave campaignId={campaignId} field="presentation.order" section="navigation" value={JSON.stringify(order)} label="Save order" />
        <StructuredSave campaignId={campaignId} field="presentation.visibility" section="navigation" value={JSON.stringify(visibility)} label="Save visibility" />
        <StructuredSave campaignId={campaignId} field="presentation.navigation" section="navigation" value={JSON.stringify(labels)} label="Save navigation labels" />
        <StructuredSave campaignId={campaignId} field="presentation.ctaColor" section="offer" value={color} label="Save button color" />
      </div>
    </section>
  );
}

function StructuredSave({
  campaignId,
  field,
  section,
  value,
  label,
}: {
  campaignId: number;
  field: string;
  section: string;
  value: string;
  label: string;
}) {
  return (
    <form
      action={async (formData) => {
        await savePresentationAction(formData);
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="value" value={value} />
      <button type="submit" className="rounded-md border border-emerald-500 px-3 py-1.5 text-sm text-emerald-300">
        {label}
      </button>
    </form>
  );
}

export function LayerReadout({ card, preview }: { card: LayerCard; preview?: "imported" | "effective" }) {
  const highlighted = card.status === "MANUAL" || card.status === "MIXED";
  const shown = preview === "imported" ? card.importedText : card.effectiveText;
  return (
    <div className={highlighted ? "space-y-2 rounded-md border border-emerald-500/50 p-3" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-200">{card.label}</p>
        <StatusPill status={card.status} />
      </div>
      <Meta label="Source" value={card.source} />
      <Meta label="Confidence" value={card.confidence} />
      <Meta label="Origin" value={card.origin} />
      <Meta label="Boundary" value={card.boundary} />
      <Meta label="Status" value={card.status} />
      <Block label="Imported Value" value={card.importedText} />
      <Block label="Override Value" value={card.overrideText ?? ""} />
      <Block label="Effective Value" value={card.effectiveText} />
      {preview ? <Block label={preview === "imported" ? "Preview Imported" : "Preview Effective"} value={shown} /> : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-zinc-400">
      <span className="uppercase tracking-wide">{label}</span> {value}
    </p>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-zinc-200">{value || "(empty)"}</p>
    </div>
  );
}

function StatusPill({ status }: { status: LayerCard["status"] }) {
  const tone =
    status === "MANUAL" || status === "MIXED"
      ? "border-emerald-500/50 text-emerald-300"
      : status === "EMPTY"
        ? "border-amber-500/50 text-amber-200"
        : "border-zinc-600 text-zinc-300";
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

export function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(value);
  }
}
