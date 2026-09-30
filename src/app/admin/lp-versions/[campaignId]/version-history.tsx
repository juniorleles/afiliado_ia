"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  autosaveVersionAction,
  publishVersionAction,
  resetWorkingAction,
  restoreCurrentAction,
  restorePreviousAction,
  restoreVersionAction,
  saveVersionAction,
  setAutosaveAction,
  type VersionView,
} from "@/app/admin/lp-versions/[campaignId]/actions";
import { compareSnapshots, type ChangeKind, type VersionChange } from "@/lib/lp-builder/version";

const KIND_CLASS: Record<ChangeKind, string> = {
  added: "bg-emerald-950 text-emerald-200",
  removed: "bg-red-950 text-red-200",
  modified: "bg-amber-950 text-amber-100",
  moved: "bg-blue-950 text-blue-200",
  hidden: "bg-zinc-800 text-zinc-200",
  restored: "bg-emerald-900 text-emerald-100",
};

export function VersionHistory({
  campaignId,
  previewHref,
  initialVersions,
  initialAutosave,
}: {
  campaignId: number;
  previewHref: string;
  initialVersions: VersionView[];
  initialAutosave: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [versions, setVersions] = useState(initialVersions);
  const [autosave, setAutosave] = useState(initialAutosave);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [leftId, setLeftId] = useState(initialVersions.find((version) => version.status === "current")?.parentId ?? "");
  const [rightId, setRightId] = useState(initialVersions.find((version) => version.status === "current")?.id ?? "");
  const current = versions.find((version) => version.status === "current") ?? null;

  useEffect(() => {
    if (!autosave) return;
    const timer = window.setInterval(() => {
      startTransition(async () => {
        const result = await autosaveVersionAction({ campaignId });
        if (result.ok) setVersions(result.versions);
      });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [autosave, campaignId]);

  function apply(result: { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setVersions(result.versions);
    setAutosave(result.autosave);
    const nextCurrent = result.versions.find((version) => version.status === "current");
    if (nextCurrent) setRightId(nextCurrent.id);
  }

  const left = versions.find((version) => version.id === leftId) ?? null;
  const right = versions.find((version) => version.id === rightId) ?? null;
  const diff = useMemo(() => (left && right ? compareSnapshots(left.snapshot, right.snapshot) : []), [left, right]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Version history</h3>
          <p className="text-sm text-zinc-400">{current ? `Current version ${current.versionNumber}` : "No current version"}</p>
        </div>
        <label className="block text-sm text-zinc-300">
          Comment
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
          />
        </label>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-emerald-700 px-3 py-2 text-white disabled:opacity-50"
            onClick={() => startTransition(async () => apply(await saveVersionAction({ campaignId, comment })))}
          >
            Save version
          </button>
          <button
            type="button"
            disabled={pending || !current}
            className="rounded-md border border-zinc-700 px-3 py-2 disabled:opacity-50"
            onClick={() => startTransition(async () => apply(await restoreCurrentAction({ campaignId })))}
          >
            Restore current
          </button>
          <button
            type="button"
            disabled={pending || !current?.parentId}
            className="rounded-md border border-zinc-700 px-3 py-2 disabled:opacity-50"
            onClick={() => startTransition(async () => apply(await restorePreviousAction({ campaignId })))}
          >
            Restore previous
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-zinc-700 px-3 py-2 disabled:opacity-50"
            onClick={() => startTransition(async () => apply(await publishVersionAction({ campaignId, comment })))}
          >
            Snapshot before publish
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-zinc-700 px-3 py-2 disabled:opacity-50"
            onClick={() => startTransition(async () => apply(await resetWorkingAction({ campaignId })))}
          >
            Reset working overrides
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={autosave}
            onChange={(event) => {
              const enabled = event.target.checked;
              setAutosave(enabled);
              startTransition(async () => apply(await setAutosaveAction({ campaignId, enabled })));
            }}
          />
          Optional autosave snapshots
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <ol className="space-y-3">
          {versions.map((version) => (
            <li key={version.id} className="rounded-lg border border-zinc-800 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Version {version.versionNumber}</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs uppercase">{version.status}</span>
                {version.status === "current" ? <span className="text-xs text-emerald-300">Current version</span> : null}
              </div>
              <p className="mt-1 text-sm text-zinc-300">{version.comment || "No comment"}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {version.createdBy} · {version.createdAt} · {version.action} · {version.overrideCount} overrides
                {version.affectedSections.length > 0 ? ` · ${version.affectedSections.join(", ")}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  className="text-emerald-400 hover:underline"
                  disabled={pending}
                  onClick={() => startTransition(async () => apply(await restoreVersionAction({ campaignId, versionId: version.id })))}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="text-emerald-400 hover:underline"
                  onClick={() => {
                    setLeftId(version.parentId ?? version.id);
                    setRightId(version.id);
                  }}
                >
                  Compare
                </button>
                <a href={previewHref} className="text-emerald-400 hover:underline">
                  Preview
                </a>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-lg font-semibold">Compare versions</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-2"
            onClick={() => {
              if (!current) return;
              setLeftId(current.parentId ?? "");
              setRightId(current.id);
            }}
          >
            Compare current
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-2"
            onClick={() => {
              const parent = versions.find((version) => version.id === current?.parentId);
              if (!parent) return;
              setLeftId(parent.parentId ?? "");
              setRightId(parent.id);
            }}
          >
            Compare previous
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            Older version
            <select value={leftId} onChange={(event) => setLeftId(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <option value="">Select</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            Newer version
            <select value={rightId} onChange={(event) => setRightId(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
              <option value="">Select</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!left || !right ? <p className="text-sm text-zinc-400">Choose two versions to highlight differences.</p> : null}
        {left && right && diff.length === 0 ? <p className="text-sm text-zinc-400">These versions match.</p> : null}
        <ul className="space-y-2">
          {diff.map((change, index) => (
            <li key={`${change.field}-${change.kind}-${index}`}>
              <DiffRow change={change} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DiffRow({ change }: { change: VersionChange }) {
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${KIND_CLASS[change.kind]}`}>
      <p className="font-medium uppercase tracking-wide">{change.kind}</p>
      <p>
        {change.overrideType} · {change.section} · {change.field}
      </p>
      <p className="break-words text-xs opacity-80">
        {change.oldValue ?? "—"} → {change.newValue ?? "—"}
      </p>
    </div>
  );
}
