"use client";

import { useEffect } from "react";
import type { ManagedSectionId } from "@/lib/editor-layers";

export function PreviewOverlay({
  hidden,
  order,
  labels,
  ctaColor,
}: {
  hidden: ManagedSectionId[];
  order: ManagedSectionId[];
  labels: Record<ManagedSectionId, string>;
  ctaColor: string | null;
}) {
  useEffect(() => {
    const root = document.querySelector("[data-presell-presentation]") ?? document.body;
    const nodes = root.querySelectorAll<HTMLElement>("[data-section-id]");
    nodes.forEach((node) => {
      node.hidden = false;
      node.style.order = "";
    });
    for (const id of hidden) {
      root.querySelectorAll<HTMLElement>(`[data-section-id="${id}"]`).forEach((node) => {
        node.hidden = true;
      });
    }
    order.forEach((id, index) => {
      root.querySelectorAll<HTMLElement>(`[data-section-id="${id}"]`).forEach((node) => {
        node.style.order = String(index);
      });
    });
  }, [hidden, order]);

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-3 text-sm text-zinc-200" style={ctaColor ? { ["--editor-cta-color" as string]: ctaColor } : undefined}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">Effective preview overlay</p>
      <nav className="mt-2 flex flex-wrap gap-3">
        {order.map((id) => (
          <span key={id} className={hidden.includes(id) ? "text-zinc-600 line-through" : "text-zinc-200"}>
            {labels[id]}
          </span>
        ))}
      </nav>
      {ctaColor ? (
        <style>{`[data-cta-position]{background-color:var(--editor-cta-color)}`}</style>
      ) : null}
    </div>
  );
}
