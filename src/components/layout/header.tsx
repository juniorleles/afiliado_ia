"use client";

import { usePathname } from "next/navigation";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import type { ThemeName } from "@/lib/ui/theme";
import { consoleNav, isConsoleNavActive } from "./navigation";
import { NotificationsButton } from "./notifications-button";
import { SearchBar } from "./search-bar";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";

export function Header({
  theme,
  onThemeChange,
  menuOpen,
  onMenuOpen,
}: {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const current = consoleNav.find((item) => isConsoleNavActive(pathname, item));
  const crumbs =
    !current || current.href === "/dashboard"
      ? [{ label: "Início" }]
      : [
          { label: "Início", href: "/dashboard" },
          { label: current.label },
        ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card px-ds-16 py-ds-8">
      <div className="flex flex-wrap items-center gap-ds-12">
        <Button type="button" variant="secondary" className="md:hidden" aria-expanded={menuOpen} aria-controls="menu-movel" onClick={() => onMenuOpen(true)}>
          Menu
        </Button>
        <div className="min-w-0 flex-1">
          <Breadcrumb items={crumbs} />
        </div>
        <div className="order-last w-full min-w-0 lg:order-none lg:w-80">
          <SearchBar />
        </div>
        <ThemeSwitcher theme={theme} onThemeChange={onThemeChange} />
        <NotificationsButton />
        <UserMenu />
      </div>
    </header>
  );
}
