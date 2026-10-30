import {
  ALLOWED_COPY_OPS,
  FORBIDDEN_AGENT_TARGETS,
  VISUAL_OPTIMIZATION_OPS,
  type CopyChange,
  type LayoutChange,
  type VisualAnalysisPlan,
  type VisualDefect,
} from "./types.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseDefect(value: unknown): VisualDefect | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const severity = asString(row.severity).toUpperCase();
  if (severity !== "HIGH" && severity !== "MEDIUM" && severity !== "LOW") return null;
  const id = asString(row.id);
  const component = asString(row.component);
  const problem = asString(row.problem);
  const proposed_fix = asString(row.proposed_fix);
  if (!id || !component || !problem || !proposed_fix) return null;
  return { id, severity, component, problem, proposed_fix };
}

function parseLayoutChange(value: unknown): LayoutChange | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const op = asString(row.op);
  if (!op) return null;
  if (typeof row.value === "boolean") return { op, value: row.value };
  const text = asString(row.value);
  if (!text) return null;
  return { op, value: text };
}

function parseCopyChange(value: unknown): CopyChange | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const op = asString(row.op);
  if (!op) return null;
  return { op, value: asString(row.value) || undefined };
}

export function emptyVisualAnalysisPlan(): VisualAnalysisPlan {
  return {
    visual_defects: [],
    layout_changes: [],
    copy_changes: [],
    expected_improvements: [],
    content_safety_risks: [],
  };
}

export function parseVisualAnalysisPlan(raw: string): { ok: true; plan: VisualAnalysisPlan } | { ok: false; reason: string } {
  const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const plan: VisualAnalysisPlan = {
      visual_defects: asArray(parsed.visual_defects).map(parseDefect).filter((item): item is VisualDefect => Boolean(item)),
      layout_changes: asArray(parsed.layout_changes).map(parseLayoutChange).filter((item): item is LayoutChange => Boolean(item)),
      copy_changes: asArray(parsed.copy_changes).map(parseCopyChange).filter((item): item is CopyChange => Boolean(item)),
      expected_improvements: asArray(parsed.expected_improvements).map(asString).filter(Boolean),
      content_safety_risks: asArray(parsed.content_safety_risks).map(asString).filter(Boolean),
    };
    return { ok: true, plan };
  } catch {
    return { ok: false, reason: "Visual analysis response is not valid JSON." };
  }
}

export function isAllowedLayoutOp(op: string): op is (typeof VISUAL_OPTIMIZATION_OPS)[number] {
  return (VISUAL_OPTIMIZATION_OPS as readonly string[]).includes(op);
}

export function isAllowedCopyOp(op: string): op is (typeof ALLOWED_COPY_OPS)[number] {
  return (ALLOWED_COPY_OPS as readonly string[]).includes(op);
}

export function isForbiddenAgentTarget(op: string): boolean {
  const normalized = op.toUpperCase().replace(/\s+/g, "_");
  return (FORBIDDEN_AGENT_TARGETS as readonly string[]).some((item) => normalized.includes(item));
}
