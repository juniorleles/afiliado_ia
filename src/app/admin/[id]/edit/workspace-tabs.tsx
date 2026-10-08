"use client";

import Link from "next/link";
import { useEffect, type KeyboardEvent } from "react";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

export type WorkspaceTabItem = { id: string; href: string; label: string };

export function WorkspaceCrumbName({ name }: { name: string }) {
  useEffect(() => {
    const current = document.querySelector("nav[aria-label='Trilha'] [aria-current='page']");
    if (current && current.textContent === "Campanha") current.textContent = name;
  }, [name]);
  return null;
}

export function WorkspaceTabs({
  label,
  current,
  items,
  labelledBy,
}: {
  label: string;
  current: string;
  items: WorkspaceTabItem[];
  labelledBy?: string;
}) {
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("[role='tab']")];
    const index = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? tabs[(index + 1) % tabs.length]
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs[tabs.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKey}
      className="flex gap-ds-8 overflow-x-auto border-b border-border"
    >
      {items.map((item) => {
        const selected = item.id === current;
        return (
          <Link
            key={item.id}
            id={labelledBy ? `${labelledBy}-${item.id}` : undefined}
            role="tab"
            href={item.href}
            aria-selected={selected}
            aria-controls="workspace-panel"
            tabIndex={selected ? 0 : -1}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 border-transparent px-ds-12 py-ds-8 text-body text-muted-foreground",
              "data-[selected=true]:border-primary data-[selected=true]:font-semibold data-[selected=true]:text-foreground",
              selected && "border-primary font-semibold text-foreground",
              focusRing,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
