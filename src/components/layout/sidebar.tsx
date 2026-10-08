"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { UiIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { consoleNav, isConsoleNavActive } from "./navigation";

function useDesktopSidebar() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function SidebarNav({
  expanded,
  onNavigate,
  nav = consoleNav,
}: {
  expanded: boolean;
  onNavigate?: () => void;
  nav?: typeof consoleNav;
}) {
  const pathname = usePathname();
  const desktop = useDesktopSidebar();
  const labelsVisible = expanded || desktop;

  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-ds-4">
        {nav.map((item) => {
          const active = isConsoleNavActive(pathname, item);
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-ds-12 rounded-ds-md px-ds-12 py-ds-8 text-body text-foreground transition-colors duration-ds-fast ease-ds-standard",
                focusRing,
                active ? "bg-card text-primary-text" : "hover:bg-secondary",
              )}
            >
              <UiIcon name={item.icon} size={20} className={active ? "text-primary-text" : undefined} />
              <span className={cn("truncate", !expanded && "max-xl:sr-only")}>{item.label}</span>
            </Link>
          );
          return (
            <li key={item.label}>
              {labelsVisible ? link : <Tooltip content={item.label}>{link}</Tooltip>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({
  expanded,
  onExpandedChange,
  nav = consoleNav,
  homeHref = "/dashboard",
  homeLabel = "Console",
  mark = "C",
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  nav?: typeof consoleNav;
  homeHref?: string;
  homeLabel?: string;
  mark?: string;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-background transition-[width] duration-ds-normal ease-ds-standard md:flex",
        expanded ? "w-[var(--layout-sidebar)]" : "w-ds-64 xl:w-[var(--layout-sidebar)]",
      )}
    >
      <div className="flex h-14 items-center px-ds-16">
        <Link href={homeHref} className={cn("truncate text-label text-foreground", focusRing)}>
          <span className={cn(!expanded && "max-xl:sr-only")}>{homeLabel}</span>
          {!expanded ? (
            <span className="xl:hidden" aria-hidden>
              {mark}
            </span>
          ) : null}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-ds-8">
        <SidebarNav expanded={expanded} nav={nav} />
      </div>
      <div className="hidden p-ds-8 md:block xl:hidden">
        <button
          type="button"
          className={cn("flex w-full items-center justify-center rounded-ds-md px-ds-12 py-ds-8 text-caption text-foreground hover:bg-card", focusRing)}
          aria-expanded={expanded}
          aria-label={expanded ? "Recolher menu" : "Expandir menu"}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className={cn(!expanded && "sr-only")}>{expanded ? "Recolher" : "Expandir"}</span>
          {!expanded ? <ChevronRight aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} /> : null}
        </button>
      </div>
    </aside>
  );
}
