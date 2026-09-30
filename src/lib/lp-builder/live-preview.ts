/**
 * Live preview resolution.
 * A draft is applied in memory through resolveLandingPage.
 * Invalid drafts are left out so the preview keeps the last valid text.
 */

import {
  contentDocument,
  contentOverridePayload,
  resolveContentFields,
  validateContentChange,
  type ContentField,
  type ResolvedContentField,
  type StoredContentOverride,
} from "@/lib/lp-builder/content";
import { resolveLandingPage, type LandingPageDocument } from "@/lib/lp-builder/index";

export const PREVIEW_VIEWPORTS = ["desktop", "tablet", "mobile"] as const;

export type PreviewViewport = (typeof PREVIEW_VIEWPORTS)[number];

export type PreviewView = "effective" | "generated" | "compare";

export type FieldPresence = "saved" | "modified" | "unsaved";

export const PREVIEW_VIEWPORT_WIDTH: Record<PreviewViewport, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

export type LivePreviewField = ContentField & {
  override: string | null;
  modified: boolean;
};

export type LivePreviewResult = {
  fields: ResolvedContentField[];
  errors: Record<string, string>;
  document: LandingPageDocument;
};

function savedRows(fields: readonly LivePreviewField[]): StoredContentOverride[] {
  return fields
    .filter((field) => field.override !== null)
    .map((field) => ({
      fieldId: field.id,
      value: field.override ?? "",
      createdAt: "",
      updatedAt: "",
      createdBy: "admin",
      updatedBy: "admin",
      version: 1,
    }));
}

function baseline(field: LivePreviewField): string {
  return field.override ?? field.generated;
}

export function fieldPresence(field: LivePreviewField, draft: string | undefined): FieldPresence {
  if (draft !== undefined && draft !== baseline(field)) return "unsaved";
  if (field.modified) return "modified";
  return "saved";
}

/**
 * Generated page, then saved overrides, then valid drafts.
 * The returned document is the resolveLandingPage result for that view.
 */
export function resolveLivePreview(input: {
  fields: readonly LivePreviewField[];
  drafts: Readonly<Record<string, string>>;
  view: "effective" | "generated";
}): LivePreviewResult {
  const catalog: ContentField[] = input.fields.map((field) => ({
    id: field.id,
    group: field.group,
    section: field.section,
    label: field.label,
    kind: field.kind,
    generated: field.generated,
  }));
  if (input.view === "generated") {
    const fields = resolveContentFields(catalog, []);
    return { fields, errors: {}, document: resolveLandingPage(contentDocument(catalog), {}) };
  }

  let rows = savedRows(input.fields);
  let current = resolveContentFields(catalog, rows);
  const errors: Record<string, string> = {};
  for (const field of input.fields) {
    const draft = input.drafts[field.id];
    if (draft === undefined || draft === baseline(field)) continue;
    const validated = validateContentChange(current, field.id, draft);
    if (!validated.ok) {
      errors[field.id] = validated.error;
      continue;
    }
    rows = rows.filter((row) => row.fieldId !== field.id);
    rows.push({
      fieldId: field.id,
      value: validated.value,
      createdAt: "",
      updatedAt: "",
      createdBy: "admin",
      updatedBy: "admin",
      version: 1,
    });
    current = resolveContentFields(catalog, rows);
  }
  const generated = contentDocument(catalog);
  return {
    fields: current,
    errors,
    document: resolveLandingPage(generated, contentOverridePayload(rows)),
  };
}
