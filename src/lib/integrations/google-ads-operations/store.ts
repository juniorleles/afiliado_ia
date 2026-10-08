/**
 * Local operations records.
 *
 * Snapshots and audits are insert-only. An action moves from pending to
 * approved or rejected, and from approved to executed. Nothing here calls Google.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type OperationActionStatus = "pending" | "approved" | "rejected" | "executed";

export type OperationAction = {
  id: string;
  snapshotId: string | null;
  kind: string;
  label: string;
  resourceName: string;
  reason: string;
  evidenceJson: string;
  confidence: string;
  expectedImpact: string;
  status: OperationActionStatus;
  payloadJson: string | null;
  operator: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
};

export type OperationEvent = {
  id: string;
  kind: string;
  operator: string;
  detail: string;
  resourceName: string | null;
  createdAt: string;
};

export type OperationAudit = {
  id: string;
  actionId: string;
  beforeJson: string;
  afterJson: string;
  operator: string;
  reason: string;
  resourceName: string;
  createdAt: string;
};

type ActionRow = {
  id: string;
  snapshot_id: string | null;
  kind: string;
  label: string;
  resource_name: string;
  reason: string;
  evidence_json: string;
  confidence: string;
  expected_impact: string;
  status: string;
  payload_json: string | null;
  operator: string | null;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
};

function actionFrom(row: ActionRow): OperationAction | null {
  if (row.status !== "pending" && row.status !== "approved" && row.status !== "rejected" && row.status !== "executed") return null;
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    kind: row.kind,
    label: row.label,
    resourceName: row.resource_name,
    reason: row.reason,
    evidenceJson: row.evidence_json,
    confidence: row.confidence,
    expectedImpact: row.expected_impact,
    status: row.status,
    payloadJson: row.payload_json,
    operator: row.operator,
    decidedAt: row.decided_at,
    executedAt: row.executed_at,
    createdAt: row.created_at,
  };
}

export function insertOperationSnapshot(input: { kind: string; customerId: string; campaignResourceName: string; body: unknown }): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO google_ads_operation_snapshots (id, kind, customer_id, campaign_resource_name, body_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.kind, input.customerId, input.campaignResourceName, JSON.stringify(input.body), new Date().toISOString());
  return id;
}

export function readLatestOperationSnapshot(kind: string, campaignResourceName: string): { id: string; body: unknown; createdAt: string } | null {
  const row = getDb()
    .prepare(
      `SELECT id, body_json, created_at FROM google_ads_operation_snapshots
       WHERE kind = ? AND campaign_resource_name = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(kind, campaignResourceName) as { id: string; body_json: string; created_at: string } | undefined;
  if (!row) return null;
  try {
    return { id: row.id, body: JSON.parse(row.body_json) as unknown, createdAt: row.created_at };
  } catch {
    return null;
  }
}

export function readOperationSnapshotBody(id: string): string | null {
  const row = getDb().prepare("SELECT body_json FROM google_ads_operation_snapshots WHERE id = ?").get(id) as { body_json: string } | undefined;
  return row?.body_json ?? null;
}

export function insertOperationAction(input: {
  snapshotId: string | null;
  kind: string;
  label: string;
  resourceName: string;
  reason: string;
  evidenceJson: string;
  confidence: string;
  expectedImpact: string;
}): string | null {
  const existing = getDb()
    .prepare(
      `SELECT id FROM google_ads_operation_actions
       WHERE kind = ? AND resource_name = ? AND reason = ? AND status = 'pending' LIMIT 1`,
    )
    .get(input.kind, input.resourceName, input.reason) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO google_ads_operation_actions
        (id, snapshot_id, kind, label, resource_name, reason, evidence_json, confidence, expected_impact, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      id,
      input.snapshotId,
      input.kind,
      input.label,
      input.resourceName,
      input.reason,
      input.evidenceJson,
      input.confidence,
      input.expectedImpact,
      new Date().toISOString(),
    );
  return id;
}

export function listOperationActions(status?: OperationActionStatus): OperationAction[] {
  const rows = (status
    ? getDb().prepare("SELECT * FROM google_ads_operation_actions WHERE status = ? ORDER BY created_at DESC").all(status)
    : getDb().prepare("SELECT * FROM google_ads_operation_actions ORDER BY created_at DESC").all()) as ActionRow[];
  return rows.map(actionFrom).filter((item): item is OperationAction => item !== null);
}

export function readOperationAction(id: string): OperationAction | null {
  const row = getDb().prepare("SELECT * FROM google_ads_operation_actions WHERE id = ?").get(id) as ActionRow | undefined;
  return row ? actionFrom(row) : null;
}

export function decideOperationAction(id: string, decision: "approved" | "rejected", operator: string, payloadJson: string | null): boolean {
  const result = getDb()
    .prepare(
      `UPDATE google_ads_operation_actions
       SET status = ?, operator = ?, decided_at = ?, payload_json = COALESCE(?, payload_json)
       WHERE id = ? AND status = 'pending'`,
    )
    .run(decision, operator, new Date().toISOString(), payloadJson, id);
  return result.changes === 1;
}

export function markOperationActionExecuted(id: string): boolean {
  const result = getDb()
    .prepare(`UPDATE google_ads_operation_actions SET status = 'executed', executed_at = ? WHERE id = ? AND status = 'approved'`)
    .run(new Date().toISOString(), id);
  return result.changes === 1;
}

export function insertOperationAudit(input: {
  actionId: string;
  before: unknown;
  after: unknown;
  operator: string;
  reason: string;
  resourceName: string;
}): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO google_ads_operation_audits
        (id, action_id, before_json, after_json, operator, reason, resource_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.actionId, JSON.stringify(input.before), JSON.stringify(input.after), input.operator, input.reason, input.resourceName, new Date().toISOString());
  return id;
}

export function readOperationAudit(actionId: string): OperationAudit | null {
  const row = getDb()
    .prepare("SELECT * FROM google_ads_operation_audits WHERE action_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(actionId) as
    | { id: string; action_id: string; before_json: string; after_json: string; operator: string; reason: string; resource_name: string; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    actionId: row.action_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    operator: row.operator,
    reason: row.reason,
    resourceName: row.resource_name,
    createdAt: row.created_at,
  };
}

export function insertOperationEvent(input: { kind: string; operator: string; detail: string; resourceName?: string | null }): void {
  getDb()
    .prepare(`INSERT INTO google_ads_operation_events (id, kind, operator, detail, resource_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), input.kind, input.operator, input.detail, input.resourceName ?? null, new Date().toISOString());
}

export function listOperationEvents(limit = 40): OperationEvent[] {
  const rows = getDb()
    .prepare("SELECT id, kind, operator, detail, resource_name, created_at FROM google_ads_operation_events ORDER BY created_at DESC LIMIT ?")
    .all(limit) as { id: string; kind: string; operator: string; detail: string; resource_name: string | null; created_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    operator: row.operator,
    detail: row.detail,
    resourceName: row.resource_name,
    createdAt: row.created_at,
  }));
}

export function countExecutedToday(timeZone = "America/Sao_Paulo"): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = getDb().prepare("SELECT created_at FROM google_ads_operation_events WHERE kind = 'executed'").all() as { created_at: string }[];
  return rows.filter((row) => {
    const local = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.created_at));
    return local === day;
  }).length;
}
