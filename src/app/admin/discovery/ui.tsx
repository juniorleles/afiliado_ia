import type { ReactNode } from "react";
import type { DiscoveryHealthLevel } from "@/lib/discovery/discovery-admin";

export function formatTime(iso: string | null): string {
  if (iso === null) return "—";
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "—" : `${time.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

const LEVEL_STYLE: Record<DiscoveryHealthLevel, string> = {
  OK: "border-emerald-700 bg-emerald-950/60 text-emerald-300",
  WARNING: "border-amber-700 bg-amber-950/60 text-amber-300",
  ERROR: "border-red-700 bg-red-950/60 text-red-300",
};

export function LevelBadge({ level }: { level: DiscoveryHealthLevel }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[level]}`}>{level}</span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const style = {
    neutral: "border-zinc-700 bg-zinc-800 text-zinc-300",
    good: "border-emerald-700 bg-emerald-950/60 text-emerald-300",
    warn: "border-amber-700 bg-amber-950/60 text-amber-300",
    bad: "border-red-700 bg-red-950/60 text-red-300",
  }[tone];
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs ${style}`}>{children}</span>;
}

export function sourceStatusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (status === "ACTIVE") return "good";
  if (status === "EXPERIMENTAL") return "warn";
  if (status === "DEPRECATED") return "bad";
  return "neutral";
}

export function scheduleStatusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (status === "ACTIVE") return "good";
  if (status === "PAUSED") return "warn";
  if (status === "ERROR") return "bad";
  return "neutral";
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">{children}</div>
  );
}

export function ErrorNotice({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
      {message.slice(0, 200)}
    </p>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-lg font-semibold text-zinc-100">{children}</h3>
      {note ? <p className="text-xs text-zinc-500">{note}</p> : null}
    </div>
  );
}

export const tableClass = "w-full min-w-[720px] border-collapse text-left text-sm";
export const thClass = "border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500";
export const tdClass = "border-b border-zinc-900 px-3 py-2 align-top text-zinc-300";
export const buttonClass =
  "rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-600 hover:text-emerald-300";
