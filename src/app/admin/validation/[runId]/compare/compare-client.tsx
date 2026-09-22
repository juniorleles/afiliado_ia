"use client";

import { useMemo, useState } from "react";
import type { ValidationCandidate } from "@/lib/validation/types";

function shotSrc(rel: string | null): string | null {
  if (!rel) return null;
  return `/admin/validation/artifact?path=${encodeURIComponent(rel)}`;
}

export function CompareClient({ candidates }: { candidates: ValidationCandidate[] }) {
  const [selected, setSelected] = useState<string[]>(candidates.slice(0, 4).map((c) => c.id));
  const visible = useMemo(
    () => candidates.filter((c) => selected.includes(c.id)),
    [candidates, selected],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {candidates.map((candidate) => (
          <label key={candidate.id} className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1">
            <input
              type="checkbox"
              checked={selected.includes(candidate.id)}
              onChange={() => {
                setSelected((cur) =>
                  cur.includes(candidate.id) ? cur.filter((id) => id !== candidate.id) : [...cur, candidate.id],
                );
              }}
            />
            {candidate.productName} {candidate.approach}
          </label>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((candidate) => (
          <article key={candidate.id} className="rounded-md border border-zinc-800 p-3 text-xs">
            <p className="font-medium text-sm">
              {candidate.productName} · {candidate.approach}
            </p>
            <p className="text-zinc-500">
              hero={candidate.fingerprint?.heroFamily} theme={candidate.theme} gate={candidate.contentQa.finalGate}{" "}
              visual={candidate.visualQa.status} AI={candidate.aiReview.overall} perf=
              {candidate.performance ? `${Math.round(candidate.performance.transferBytes / 1024)}KB` : "—"}
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-600">{candidate.fingerprint?.key}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {shotSrc(candidate.desktopScreenshot) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shotSrc(candidate.desktopScreenshot)!} alt="" className="h-40 w-full object-cover object-top" />
              ) : (
                <p>no desktop</p>
              )}
              {shotSrc(candidate.mobileScreenshot) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shotSrc(candidate.mobileScreenshot)!} alt="" className="h-40 w-full object-cover object-top" />
              ) : (
                <p>no mobile</p>
              )}
            </div>
            <p className="mt-2 text-zinc-400">
              Visual QA: {candidate.visualQa.actionCodes.join(", ") || "none"} · failures=
              {candidate.failures.map((f) => f.type).join(", ") || "none"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
