"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { applyTheme, type ThemeName } from "@/lib/ui/theme";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { Sidebar, SidebarNav } from "./sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>("light");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <div className="min-h-screen">
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
        <Sidebar expanded={expanded} onExpandedChange={setExpanded} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header theme={theme} onThemeChange={setTheme} menuOpen={menuOpen} onMenuOpen={setMenuOpen} />
          <main id="conteudo" className="flex-1">
            {children}
          </main>
        </div>
      </div>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent id="menu-movel">
          <DialogTitle className="mb-ds-16 pr-ds-32 text-h3">Menu</DialogTitle>
          <SidebarNav expanded onNavigate={() => setMenuOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
