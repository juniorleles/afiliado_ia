"use client";

import { useState } from "react";
import { resetManualOverrideAction, resetManualSectionAction, saveManualOverrideAction } from "@/app/admin/product-editor/[campaignId]/actions";
import { LiveEditorForm, useCompletenessAssistant, useLiveFieldDraft } from "@/components/admin/completeness-assistant";
import { EvidenceFilterBar, FieldEvidencePanel, matchesFilter } from "@/app/admin/product-editor/[campaignId]/evidence-panel";
import { LayerReadout, PresentationEditor, copyText, type PresentationFormState } from "@/app/admin/product-editor/[campaignId]/editor-overlay";
import { buildLayerCard } from "@/lib/editor-layers";
import type { EvidenceFilter, FieldEvidence } from "@/lib/evidence-manager";
import type {
  EditorField,
  FaqDraft,
  GuaranteeDraft,
  PackageDraft,
  ProductEditorModel,
  UsageDraft,
} from "@/lib/manual-overrides";

const inputClass = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100";

export function ProductEditorForm({
  model,
  evidence,
  presentation,
  audit,
}: {
  model: ProductEditorModel;
  evidence: FieldEvidence[];
  presentation: PresentationFormState;
  audit: Array<{ field: string; section: string; at: string; userName: string; operation: string; oldValue: string | null; newValue: string | null }>;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [preview, setPreview] = useState<"imported" | "effective">("effective");
  const [sectionPreview, setSectionPreview] = useState<string | null>(null);
  const byField = new Map(evidence.map((item) => [item.field, item]));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-300">Preview</p>
        <button type="button" onClick={() => setPreview("imported")} className={preview === "imported" ? "rounded-md bg-zinc-100 px-3 py-1.5 text-sm text-zinc-950" : "rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200"}>
          Imported
        </button>
        <button type="button" onClick={() => setPreview("effective")} className={preview === "effective" ? "rounded-md bg-zinc-100 px-3 py-1.5 text-sm text-zinc-950" : "rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200"}>
          Effective
        </button>
      </div>
      <PresentationEditor campaignId={model.campaignId} state={presentation} />
      <EvidenceFilterBar value={filter} onChange={setFilter} />
      {model.sections.map((section) => {
        const fields = section.fields.filter((field) => matchesFilter(byField.get(field.field), filter));
        if (fields.length === 0) return null;
        return (
          <section id={section.id} key={section.id} className="scroll-mt-8 space-y-4 rounded-md border border-zinc-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-medium">{section.title}</h3>
              <button type="button" onClick={() => setSectionPreview(section.id)} className="text-sm text-emerald-300 hover:underline">
                Preview Section
              </button>
              <form action={resetManualSectionAction}>
                <input type="hidden" name="campaignId" value={model.campaignId} />
                <input type="hidden" name="section" value={section.id} />
                <button type="submit" className="text-sm text-amber-300 hover:underline">
                  Reset Section
                </button>
              </form>
            </div>
            {sectionPreview === section.id ? (
              <div className="rounded-md border border-emerald-500/40 px-3 py-2 text-sm text-zinc-200">
                {fields.map((field) => (
                  <p key={field.field} className="whitespace-pre-wrap">
                    {preview === "imported" ? field.importedText : displayValue(field)}
                  </p>
                ))}
              </div>
            ) : null}
            {fields.map((field) => (
              <FieldEditor
                key={field.field}
                campaignId={model.campaignId}
                sectionId={section.id}
                field={field}
                evidence={byField.get(field.field)}
                preview={preview}
              />
            ))}
          </section>
        );
      })}
      <AuditList rows={audit} />
    </div>
  );
}

function FieldEditor({
  campaignId,
  sectionId,
  field,
  evidence,
  preview,
}: {
  campaignId: number;
  sectionId: string;
  field: EditorField;
  evidence?: FieldEvidence;
  preview: "imported" | "effective";
}) {
  const [editing, setEditing] = useState(false);
  const assistant = useCompletenessAssistant();
  const overrideText = field.source === "MANUAL" ? displayValue(field) : null;
  const card = buildLayerCard({
    field: field.field,
    sectionId,
    label: field.label,
    importedText: field.importedText,
    overrideText,
    list: field.kind === "list" || field.kind === "faq" || field.kind === "packages",
    confidence: evidence?.confidence ?? "NOT_FOUND",
    origin: evidence?.origin ?? (field.source === "MANUAL" ? "MANUAL" : "IMPORTER"),
    source: field.source === "MANUAL" ? "MANUAL" : "AUTO",
  });
  const latest = evidence?.revisions[evidence.revisions.length - 1];
  const previous = evidence && evidence.revisions.length > 1 ? evidence.revisions[evidence.revisions.length - 2] : undefined;
  return (
    <div id={field.field} className="scroll-mt-8 space-y-2 border-t border-zinc-800 pt-4 first:border-t-0 first:pt-0">
      <LayerReadout card={card} preview={preview} />
      {evidence ? (
        <p className="text-xs text-zinc-400">
          Created {evidence.capturedAt} by {evidence.capturedBy}. Modified {evidence.lastModified} by {latest?.operatorName ?? evidence.capturedBy}. Field {field.field}. Section {sectionId}.
          {previous ? ` Previous value recorded in revision ${previous.revision}.` : ""}
        </p>
      ) : null}
      {evidence ? <FieldEvidencePanel campaignId={campaignId} evidence={evidence} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200">
          Edit
        </button>
        <button type="button" onClick={() => copyText(field.importedText)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200">
          Copy Imported
        </button>
        <button type="button" onClick={() => copyText(card.effectiveText)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200">
          Copy Effective
        </button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <FieldControl campaignId={campaignId} field={field} />
          <button
            type="button"
            onClick={() => {
              assistant?.revert(field.field);
              setEditing(false);
            }}
            className="text-sm text-zinc-300 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {field.source === "MANUAL" ? (
        <form action={resetManualOverrideAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="field" value={field.field} />
          <button type="submit" className="text-sm text-amber-300 hover:underline">
            Reset Override
          </button>
        </form>
      ) : null}
    </div>
  );
}

function displayValue(field: EditorField): string {
  if (typeof field.value === "string") return field.value;
  if (field.kind === "list" && Array.isArray(field.value)) return (field.value as string[]).join("\n");
  if (field.kind === "faq" && Array.isArray(field.value)) {
    return (field.value as FaqDraft[]).map((item) => `${item.question}\n${item.answer}`.trim()).filter(Boolean).join("\n\n");
  }
  return JSON.stringify(field.value, null, 2);
}

function AuditList({
  rows,
}: {
  rows: Array<{ field: string; section: string; at: string; userName: string; operation: string; oldValue: string | null; newValue: string | null }>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-medium">Audit</h3>
      <ul className="space-y-2 text-sm text-zinc-300">
        {rows.map((row, index) => (
          <li key={`${row.field}-${row.at}-${index}`} className="rounded-md border border-zinc-800 px-3 py-2">
            {row.operation} {row.field} in {row.section || "field"} by {row.userName} at {row.at}. Previous: {row.oldValue || "(empty)"}. New: {row.newValue || "(empty)"}.
          </li>
        ))}
      </ul>
    </section>
  );
}

function FieldControl({ campaignId, field }: { campaignId: number; field: EditorField }) {
  if (field.kind === "list" && Array.isArray(field.value)) {
    return (
      <ListControl
        campaignId={campaignId}
        fieldName={field.field}
        items={field.value as string[]}
        importedText={field.importedText}
      />
    );
  }
  if (field.kind === "text" || field.kind === "textarea") {
    return <TextControl campaignId={campaignId} field={field} />;
  }
  if (field.kind === "faq" && Array.isArray(field.value)) {
    return <FaqControl campaignId={campaignId} items={field.value as FaqDraft[]} importedText={field.importedText} />;
  }
  if (field.kind === "usage" && field.value && typeof field.value === "object") {
    return <UsageControl campaignId={campaignId} value={field.value as UsageDraft} importedText={field.importedText} />;
  }
  if (field.kind === "guarantee" && field.value && typeof field.value === "object") {
    return <GuaranteeControl campaignId={campaignId} value={field.value as GuaranteeDraft} importedText={field.importedText} />;
  }
  if (field.kind === "packages" && Array.isArray(field.value)) {
    return <PackageControl campaignId={campaignId} items={field.value as PackageDraft[]} importedText={field.importedText} />;
  }
  return null;
}

function SaveButton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input name="reason" placeholder="Reason (optional)" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100" />
      <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950">
        Save
      </button>
    </div>
  );
}

function FactDiffLine({ importer, manual }: { importer: string; manual: string }) {
  const norm = (value: string) => value.replace(/\s+/g, " ").trim();
  if (norm(importer) === norm(manual)) return null;
  return (
    <div className="rounded-md border border-zinc-700 px-3 py-2 text-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Importer value</p>
      <p className="whitespace-pre-wrap text-zinc-300">{importer || "(empty)"}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">Manual value</p>
      <p className="whitespace-pre-wrap text-emerald-200">{manual || "(empty)"}</p>
    </div>
  );
}

function TextControl({ campaignId, field }: { campaignId: number; field: EditorField }) {
  const text = typeof field.value === "string" ? field.value : "";
  const [draft, setDraft] = useState(text);
  useLiveFieldDraft(field.field, draft, field.importedText, false);
  return (
    <LiveEditorForm action={saveManualOverrideAction} field={field.field} className="space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value={field.field} />
      {field.kind === "textarea" ? (
        <textarea name="value" value={draft} rows={5} onChange={(event) => setDraft(event.target.value)} className={inputClass} />
      ) : (
        <input name="value" value={draft} onChange={(event) => setDraft(event.target.value)} className={inputClass} />
      )}
      <FactDiffLine importer={field.importedText} manual={draft} />
      <SaveButton />
    </LiveEditorForm>
  );
}

function ListControl({
  campaignId,
  fieldName,
  items,
  importedText,
}: {
  campaignId: number;
  fieldName: string;
  items: string[];
  importedText: string;
}) {
  const [rows, setRows] = useState(items.length > 0 ? items : [""]);
  useLiveFieldDraft(fieldName, JSON.stringify(rows), importedText, true);
  return (
    <LiveEditorForm action={saveManualOverrideAction} field={fieldName} className="space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value={fieldName} />
      <input type="hidden" name="value" value={JSON.stringify(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input
            value={row}
            onChange={(event) => setRows(rows.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
            className={inputClass}
          />
          <button type="button" className="text-sm text-zinc-400" onClick={() => move(rows, index, -1, setRows)}>
            Up
          </button>
          <button type="button" className="text-sm text-zinc-400" onClick={() => move(rows, index, 1, setRows)}>
            Down
          </button>
          <button
            type="button"
            className="text-sm text-red-300"
            onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <FactDiffLine importer={importedText} manual={rows.filter(Boolean).join("\n")} />
      <div className="flex gap-3">
        <button type="button" className="text-sm text-zinc-300" onClick={() => setRows([...rows, ""])}>
          Add
        </button>
        <SaveButton />
      </div>
    </LiveEditorForm>
  );
}

function FaqControl({ campaignId, items, importedText }: { campaignId: number; items: FaqDraft[]; importedText: string }) {
  const [rows, setRows] = useState<FaqDraft[]>(items.length > 0 ? items : [{ question: "", answer: "" }]);
  useLiveFieldDraft("faq", JSON.stringify(rows), importedText, true);
  return (
    <LiveEditorForm action={saveManualOverrideAction} field="faq" className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value="faq" />
      <input type="hidden" name="value" value={JSON.stringify(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="space-y-2 rounded-md border border-zinc-800 p-3">
          <label className="block text-sm text-zinc-400">
            Question
            <input
              value={row.question}
              onChange={(event) => updateRow(rows, index, { question: event.target.value }, setRows)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-zinc-400">
            Answer
            <textarea
              value={row.answer}
              rows={3}
              onChange={(event) => updateRow(rows, index, { answer: event.target.value }, setRows)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-zinc-400" onClick={() => move(rows, index, -1, setRows)}>
              Up
            </button>
            <button type="button" className="text-zinc-400" onClick={() => move(rows, index, 1, setRows)}>
              Down
            </button>
            <button type="button" className="text-red-300" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <FactDiffLine importer={importedText} manual={rows.map((row) => `${row.question} ${row.answer}`.trim()).filter(Boolean).join("\n")} />
      <div className="flex gap-3">
        <button type="button" className="text-sm text-zinc-300" onClick={() => setRows([...rows, { question: "", answer: "" }])}>
          Add
        </button>
        <SaveButton />
      </div>
    </LiveEditorForm>
  );
}

function UsageControl({ campaignId, value, importedText }: { campaignId: number; value: UsageDraft; importedText: string }) {
  const [draft, setDraft] = useState(value);
  useLiveFieldDraft("usage", JSON.stringify(draft), importedText, false);
  return (
    <LiveEditorForm action={saveManualOverrideAction} field="usage" className="space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value="usage" />
      <input type="hidden" name="value" value={JSON.stringify(draft)} />
      <Labeled label="Instruction" value={draft.instruction} onChange={(instruction) => setDraft({ ...draft, instruction })} long />
      <Labeled label="Frequency" value={draft.frequency} onChange={(frequency) => setDraft({ ...draft, frequency })} />
      <Labeled label="Amount" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} />
      <Labeled label="Notes" value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} long />
      <FactDiffLine
        importer={importedText}
        manual={[draft.instruction, draft.frequency, draft.amount, draft.notes].filter(Boolean).join("\n")}
      />
      <SaveButton />
    </LiveEditorForm>
  );
}

function GuaranteeControl({ campaignId, value, importedText }: { campaignId: number; value: GuaranteeDraft; importedText: string }) {
  const [draft, setDraft] = useState(value);
  useLiveFieldDraft("guarantee", JSON.stringify(draft), importedText, false);
  return (
    <LiveEditorForm action={saveManualOverrideAction} field="guarantee" className="space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value="guarantee" />
      <input type="hidden" name="value" value={JSON.stringify(draft)} />
      <Labeled label="Duration" value={draft.duration} onChange={(duration) => setDraft({ ...draft, duration })} />
      <Labeled label="Text" value={draft.text} onChange={(text) => setDraft({ ...draft, text })} long />
      <FactDiffLine importer={importedText} manual={[draft.duration, draft.text].filter(Boolean).join(". ")} />
      <SaveButton />
    </LiveEditorForm>
  );
}

function PackageControl({ campaignId, items, importedText }: { campaignId: number; items: PackageDraft[]; importedText: string }) {
  const blank: PackageDraft = {
    packageName: "",
    quantity: "",
    unitPrice: "",
    totalPrice: "",
    savings: "",
    shipping: "",
    bonus: "",
  };
  const [rows, setRows] = useState<PackageDraft[]>(items.length > 0 ? items : [blank]);
  useLiveFieldDraft("pricing", JSON.stringify(rows), importedText, true);
  const keys: Array<keyof PackageDraft> = [
    "packageName",
    "quantity",
    "unitPrice",
    "totalPrice",
    "savings",
    "shipping",
    "bonus",
  ];
  const labels: Record<keyof PackageDraft, string> = {
    packageName: "Package Name",
    quantity: "Quantity",
    unitPrice: "Unit Price",
    totalPrice: "Total Price",
    savings: "Savings",
    shipping: "Shipping",
    bonus: "Bonus",
  };
  return (
    <LiveEditorForm action={saveManualOverrideAction} field="pricing" className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value="pricing" />
      <input type="hidden" name="value" value={JSON.stringify(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-md border border-zinc-800 p-3 sm:grid-cols-2">
          {keys.map((key) => (
            <label key={key} className="block text-sm text-zinc-400">
              {labels[key]}
              <input
                value={row[key]}
                onChange={(event) => {
                  const next = rows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, [key]: event.target.value } : item,
                  );
                  setRows(next);
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
          ))}
          <div className="flex gap-3 text-sm sm:col-span-2">
            <button type="button" className="text-zinc-400" onClick={() => move(rows, index, -1, setRows)}>
              Up
            </button>
            <button type="button" className="text-zinc-400" onClick={() => move(rows, index, 1, setRows)}>
              Down
            </button>
            <button type="button" className="text-red-300" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <FactDiffLine
        importer={importedText}
        manual={rows.map((row) => [row.packageName, row.totalPrice || row.unitPrice].filter(Boolean).join(" ")).filter(Boolean).join("\n")}
      />
      <div className="flex gap-3">
        <button type="button" className="text-sm text-zinc-300" onClick={() => setRows([...rows, blank])}>
          Add
        </button>
        <SaveButton />
      </div>
    </LiveEditorForm>
  );
}

function Labeled({
  label,
  value,
  onChange,
  long = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  long?: boolean;
}) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      {long ? (
        <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-1`} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-1`} />
      )}
    </label>
  );
}

function move<T>(rows: T[], index: number, direction: -1 | 1, setRows: (rows: T[]) => void) {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return;
  const next = rows.slice();
  const current = next[index];
  next[index] = next[target]!;
  next[target] = current!;
  setRows(next);
}

function updateRow<T>(rows: T[], index: number, patch: Partial<T>, setRows: (rows: T[]) => void) {
  setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}
