import { getDb } from "@/lib/db";
import {
  isPresentationField,
  parseNavLabels,
  parseSectionOrder,
  parseVisibility,
  validatePresentationValue,
  type ManagedSectionId,
  type PresentationField,
} from "@/lib/editor-layers";

export type PresentationOverlay = {
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
};

const FIELD_KEY: Record<keyof PresentationOverlay, PresentationField> = {
  headline: "presentation.headline",
  subheadline: "presentation.subheadline",
  shipping: "presentation.shipping",
  returns: "presentation.returns",
  bonus: "presentation.bonus",
  images: "presentation.images",
  disclosure: "presentation.disclosure",
  footer: "presentation.footer",
  navigation: "presentation.navigation",
  visibility: "presentation.visibility",
  order: "presentation.order",
  ctaColor: "presentation.ctaColor",
};

type Row = { field: string; value: string; createdAt: string; updatedAt: string };

export function listPresentationOverlay(campaignId: number): PresentationOverlay {
  const rows = getDb()
    .prepare(
      `SELECT field, value, createdAt, updatedAt
       FROM campaign_manual_overrides
       WHERE campaignId = ? AND field LIKE 'presentation.%'`,
    )
    .all(campaignId) as Row[];
  const byField = new Map(rows.map((row) => [row.field, row.value]));
  return {
    headline: readText(byField.get(FIELD_KEY.headline)),
    subheadline: readText(byField.get(FIELD_KEY.subheadline)),
    shipping: readText(byField.get(FIELD_KEY.shipping)),
    returns: readText(byField.get(FIELD_KEY.returns)),
    bonus: readText(byField.get(FIELD_KEY.bonus)),
    images: readText(byField.get(FIELD_KEY.images)),
    disclosure: readText(byField.get(FIELD_KEY.disclosure)),
    footer: readText(byField.get(FIELD_KEY.footer)),
    navigation: readJson(byField.get(FIELD_KEY.navigation), parseNavLabels),
    visibility: readJson(byField.get(FIELD_KEY.visibility), parseVisibility),
    order: readJson(byField.get(FIELD_KEY.order), parseSectionOrder),
    ctaColor: readText(byField.get(FIELD_KEY.ctaColor)),
  };
}

export function savePresentationField(input: {
  campaignId: number;
  field: PresentationField;
  raw: string;
  section: string;
}): { ok: true } | { ok: false; message: string } {
  if (!isPresentationField(input.field)) return { ok: false, message: "Unknown field." };
  const checked = validatePresentationValue(input.field, input.raw);
  if (!checked.ok) return checked;
  const previous = readStored(input.campaignId, input.field);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO campaign_manual_overrides (campaignId, field, value, createdAt, updatedAt)
       VALUES (@campaignId, @field, @value, @createdAt, @updatedAt)
       ON CONFLICT(campaignId, field) DO UPDATE SET
         value = excluded.value,
         updatedAt = excluded.updatedAt`,
    )
    .run({
      campaignId: input.campaignId,
      field: input.field,
      value: JSON.stringify(checked.value),
      createdAt: now,
      updatedAt: now,
    });
  writeAudit({
    campaignId: input.campaignId,
    field: input.field,
    section: input.section,
    previous,
    next: typeof checked.value === "string" ? checked.value : JSON.stringify(checked.value),
    operation: previous === null ? "CREATE" : "UPDATE",
  });
  return { ok: true };
}

export function resetPresentationField(campaignId: number, field: PresentationField, section: string): void {
  const previous = readStored(campaignId, field);
  getDb().prepare("DELETE FROM campaign_manual_overrides WHERE campaignId = ? AND field = ?").run(campaignId, field);
  writeAudit({
    campaignId,
    field,
    section,
    previous,
    next: null,
    operation: "RESET",
  });
}

export function listOverrideAudit(campaignId: number): Array<{
  field: string;
  section: string;
  at: string;
  userName: string;
  operation: string;
  oldValue: string | null;
  newValue: string | null;
}> {
  const rows = getDb()
    .prepare(
      `SELECT field, at, userName, operation, oldValue, newValue, reason
       FROM fact_audit_log
       WHERE campaignId = ?
       ORDER BY id DESC
       LIMIT 40`,
    )
    .all(campaignId) as Array<{
    field: string;
    at: string;
    userName: string;
    operation: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
  }>;
  return rows.map((row) => ({
    field: row.field,
    section: row.reason ?? "",
    at: row.at,
    userName: row.userName,
    operation: row.operation,
    oldValue: row.oldValue,
    newValue: row.newValue,
  }));
}

function readStored(campaignId: number, field: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM campaign_manual_overrides WHERE campaignId = ? AND field = ?")
    .get(campaignId, field) as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === "string" ? parsed : row.value;
  } catch {
    return row.value;
  }
}

function readText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function readJson<T>(raw: string | undefined, parse: (value: unknown) => T): T | null {
  if (raw === undefined) return null;
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeAudit(input: {
  campaignId: number;
  field: string;
  section: string;
  previous: string | null;
  next: string | null;
  operation: "CREATE" | "UPDATE" | "RESET";
}): void {
  getDb()
    .prepare(
      `INSERT INTO fact_audit_log (campaignId, field, at, userName, operation, oldValue, newValue, reason, revision)
       VALUES (@campaignId, @field, @at, @userName, @operation, @oldValue, @newValue, @reason, NULL)`,
    )
    .run({
      campaignId: input.campaignId,
      field: input.field,
      at: new Date().toISOString(),
      userName: "operator",
      operation: input.operation,
      oldValue: input.previous,
      newValue: input.next,
      reason: input.section,
    });
}
