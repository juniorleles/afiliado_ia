/**
 * Workflow Engine: schedule resolver.
 *
 * Names which planned window is open now, and when the next window opens. It
 * only reads. It never changes an item, never opens a window by itself, and
 * never runs work. Equal items keep a stable order: earlier startAt first,
 * then id.
 */
import type { WorkflowScheduleKind, WorkflowExecutionWindow } from "./workflow-schedule-registry";

export interface WorkflowScheduleOrderable {
  id: string;
  executionWindow: Pick<WorkflowExecutionWindow, "startAt" | "kind" | "paused" | "endAt" | "intervalMs">;
}

const isIso = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

function windowEnd(window: Pick<WorkflowExecutionWindow, "endAt">): number | null {
  if (window.endAt === null) return null;
  if (!isIso(window.endAt)) return null;
  return Date.parse(window.endAt);
}

function nextRecurringAt(startAt: number, intervalMs: number, nowMs: number): number {
  if (nowMs < startAt) return startAt;
  return startAt + (Math.floor((nowMs - startAt) / intervalMs) + 1) * intervalMs;
}

/** The next planned instant, or null when none remains. */
export function resolveWorkflowNextRun(
  window: Pick<WorkflowExecutionWindow, "kind" | "startAt" | "endAt" | "intervalMs" | "paused">,
  nowMs: number,
): string | null {
  if (window.paused || window.kind === "Manual") return null;
  if (!isIso(window.startAt)) return null;
  const startAt = Date.parse(window.startAt);
  const endAt = windowEnd(window);
  if (endAt !== null && startAt >= endAt) return null;

  if (window.kind === "Recurring") {
    const intervalMs = window.intervalMs;
    if (typeof intervalMs !== "number" || intervalMs <= 0) return null;
    const nextAt = nextRecurringAt(startAt, intervalMs, nowMs);
    if (endAt !== null && nextAt >= endAt) return null;
    return new Date(nextAt).toISOString();
  }

  if (nowMs < startAt && (endAt === null || startAt < endAt)) return window.startAt;
  return null;
}

/** True when the window is open at nowMs. Manual and paused windows are never open. */
export function isWorkflowScheduleEligible(
  window: Pick<WorkflowExecutionWindow, "kind" | "startAt" | "endAt" | "paused">,
  nowMs: number,
): boolean {
  if (window.paused || window.kind === "Manual") return false;
  if (!isIso(window.startAt)) return false;
  const startAt = Date.parse(window.startAt);
  if (nowMs < startAt) return false;
  const endAt = windowEnd(window);
  if (endAt !== null && nowMs >= endAt) return false;
  return true;
}

export function orderWorkflowScheduleItems<T extends WorkflowScheduleOrderable>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.executionWindow.startAt.localeCompare(b.executionWindow.startAt) || a.id.localeCompare(b.id),
  );
}

export function resolveWorkflowEligibleNow<T extends WorkflowScheduleOrderable>(
  items: readonly T[],
  nowMs: number,
  kind?: WorkflowScheduleKind,
): T[] {
  const open = items.filter((item) => {
    if (kind !== undefined && item.executionWindow.kind !== kind) return false;
    return isWorkflowScheduleEligible(item.executionWindow, nowMs);
  });
  return orderWorkflowScheduleItems(open);
}
