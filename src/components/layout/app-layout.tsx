"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ToastProvider } from "@/components/ui/toast";
import { applyTheme, type ThemeName } from "@/lib/ui/theme";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { adminCrumbs, adminNav, consoleNav, operatorCrumbs, type ConsoleNavItem } from "./navigation";
import { Sidebar, SidebarNav } from "./sidebar";
import type { BreadcrumbItem } from "@/components/ui/breadcrumb";

function NavigationProgress() {
  const [width, setWidth] = useState("0%");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWidth("80%"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="progressbar"
      aria-label="Carregando a página"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={80}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-secondary"
    >
      <div className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-ds-normal" style={{ width }} />
    </div>
  );
}

export function AppLayout({
  children,
  shell = "console",
  nav,
  crumbsFor,
  homeHref,
  homeLabel,
  mark,
  tone,
  headerExtra,
}: {
  children: ReactNode;
  shell?: "console" | "admin";
  nav?: ConsoleNavItem[];
  crumbsFor?: (pathname: string) => BreadcrumbItem[];
  homeHref?: string;
  homeLabel?: string;
  mark?: string;
  tone?: "console" | "admin";
  headerExtra?: ReactNode;
}) {
  const resolvedNav = nav ?? (shell === "admin" ? adminNav : consoleNav);
  const resolvedCrumbs = crumbsFor ?? (shell === "admin" ? adminCrumbs : operatorCrumbs);
  const resolvedHome = homeHref ?? (shell === "admin" ? "/admin" : "/dashboard");
  const resolvedLabel = homeLabel ?? (shell === "admin" ? "Administração" : "Console");
  const resolvedMark = mark ?? (shell === "admin" ? "A" : "C");
  const resolvedTone = tone ?? shell;
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeName>("light");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const firstPath = useRef(true);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
  }, []);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    setNavigating(true);
    const timer = window.setTimeout(() => setNavigating(false), 320);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const dialogOpen = document.querySelector("[role='dialog'][data-state='open']");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (dialogOpen) return;
        event.preventDefault();
        const market = document.getElementById("market-keyword");
        const input = market instanceof HTMLInputElement ? market : document.getElementById("global-search");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (dialogOpen || document.querySelector("[role='menu']")) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || target.isContentEditable) return;
      const slot = document.querySelector("[data-primary-action]");
      const control = slot?.querySelector<HTMLElement>("a, button");
      if (!control) return;
      event.preventDefault();
      control.click();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen">
        {navigating ? <NavigationProgress /> : null}
        <a
          href="#conteudo"
          className={cn(
            "absolute left-ds-16 top-ds-16 z-50 -translate-y-24 rounded-ds-sm bg-card px-ds-12 py-ds-8 text-body text-foreground shadow-ds-1 focus:translate-y-0",
            focusRing,
          )}
        >
          Ir para o conteúdo
        </a>
        <div className="flex min-h-screen">
          <Sidebar expanded={expanded} onExpandedChange={setExpanded} nav={resolvedNav} homeHref={resolvedHome} homeLabel={resolvedLabel} mark={resolvedMark} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header theme={theme} onThemeChange={setTheme} menuOpen={menuOpen} onMenuOpen={setMenuOpen} crumbsFor={resolvedCrumbs} extra={headerExtra} />
            <main id="conteudo" key={pathname} className="ds-page-enter flex-1">
              {resolvedTone === "admin" && pathname !== "/admin" && !pathname.startsWith("/admin/system") && !/^\/admin\/\d+\/edit\/?$/.test(pathname) ? (
                <div className="mx-auto min-h-full w-full max-w-3xl bg-zinc-950 px-6 py-10 text-zinc-100 has-[[data-preview-wide]]:max-w-[1480px]">
                  {children}
                </div>
              ) : (
                children
              )}
            </main>
          </div>
        </div>
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent id="menu-movel">
            <DialogTitle className="mb-ds-16 pr-ds-32 text-h3">Menu</DialogTitle>
            <SidebarNav expanded onNavigate={() => setMenuOpen(false)} nav={resolvedNav} />
          </DialogContent>
        </Dialog>
      </div>
    </ToastProvider>
  );
}
