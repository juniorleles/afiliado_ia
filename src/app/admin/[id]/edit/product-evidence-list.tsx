"use client";

import { useState } from "react";
import Link from "next/link";
import { EvidenceFilterBar, FieldEvidencePanel, matchesFilter } from "@/app/admin/product-editor/[campaignId]/evidence-panel";
import type { EvidenceFilter, FieldEvidence } from "@/lib/evidence-manager";

export function ProductEvidenceList({
  campaignId,
  landingHref,
  rows,
}: {
  campaignId: number;
  landingHref: string;
  rows: FieldEvidence[];
}) {
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const observed = rows.filter((row) => row.revision > 0);
  const visible = observed.filter((row) => matchesFilter(row, filter));
  const timeline = observed
    .flatMap((row) => row.revisions.map((revision) => ({ field: row.field, at: revision.lastModified || revision.capturedAt, origin: revision.origin, confidence: revision.confidence })))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-ds-16">
      <div className="flex flex-wrap items-center justify-between gap-ds-8">
        <EvidenceFilterBar value={filter} onChange={setFilter} />
        <Link href={landingHref} className="text-body text-primary-text underline-offset-4 hover:underline">
          Abrir landing page
        </Link>
      </div>
      {visible.length === 0 ? (
        <p className="text-body text-zinc-300">Nenhum fato observado gravado.</p>
      ) : (
        <ul className="flex flex-col gap-ds-12">
          {visible.map((row) => (
            <li key={row.field} className="rounded-md border border-zinc-800 p-ds-12">
              <h3 className="text-body font-medium text-zinc-100">{row.field}</h3>
              <p className="mt-ds-4 text-caption text-zinc-400">Fonte {sourceLabel(row.source.sourceUrl)}</p>
              <div className="mt-ds-8">
                <FieldEvidencePanel campaignId={campaignId} evidence={row} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="evidence-timeline">
        <h3 id="evidence-timeline" className="text-body font-medium text-zinc-100">Linha do tempo</h3>
        {timeline.length === 0 ? (
          <p className="mt-ds-8 text-body text-zinc-400">Nenhuma revisão gravada.</p>
        ) : (
          <ol className="mt-ds-8 flex flex-col gap-ds-8 text-body text-zinc-200">
            {timeline.map((item) => (
              <li key={`${item.field}-${item.at}-${item.origin}`}>
                {item.field} · {item.origin} · {item.confidence} · {item.at || "Sem data"}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function sourceLabel(url: string | null) {
  if (!url) return "Não observada";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "Endereço não legível";
  }
}
