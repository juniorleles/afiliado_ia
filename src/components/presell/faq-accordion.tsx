import type { PresellFaqItem } from "@/lib/presell-page";

export function FAQAccordion({ items }: { items: PresellFaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 divide-y divide-[color:var(--ps-border,#27272a)] overflow-hidden rounded-2xl border border-[color:var(--ps-border,#27272a)]">
      {items.map((item) => (
        <details key={item.question} className="group bg-[color:var(--ps-surface,#18181b)] open:bg-[color:mix(in_srgb,var(--ps-surface-alt,#27272a)_70%,transparent)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[color:var(--ps-text,#fafafa)] marker:content-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ps-accent,#34d399)]">
            <span className="flex items-start justify-between gap-3">
              <span>{item.question}</span>
              <span className="text-[color:var(--ps-accent,#34d399)] group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </span>
          </summary>
          <p className="px-4 pb-4 text-sm leading-relaxed text-[color:var(--ps-text-muted,#a1a1aa)]">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
