"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Folder,
  LayoutGrid,
  LineChart,
  Menu,
  Package,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { prototypeOperator } from "@/lib/prototype/mock";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/prototype", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/prototype/pesquisa", label: "Pesquisa", icon: Search },
  { href: "/prototype/produto", label: "Products", icon: Package },
  { href: "/prototype/oportunidade", label: "Oportunidades", icon: BarChart3 },
  { href: "/prototype/campanhas", label: "Campanhas", icon: Folder },
  { href: "/prototype/relatorios", label: "Relatórios", icon: LineChart },
  { href: "/prototype/configuracoes", label: "Configurações", icon: SlidersHorizontal },
] as const;

function active(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function crumbsFor(pathname: string): Array<{ href: string; label: string }> {
  const home = { href: "/prototype", label: "Início" };
  if (pathname === "/prototype") return [home];
  if (pathname.startsWith("/prototype/pesquisa/resultado")) {
    return [home, { href: "/prototype/pesquisa", label: "Pesquisa de Mercado" }, { href: pathname, label: "Resultado" }];
  }
  if (pathname.startsWith("/prototype/pesquisa")) {
    return [home, { href: "/prototype/pesquisa", label: "Pesquisa de Mercado" }];
  }
  if (pathname.startsWith("/prototype/produto/landing-page")) {
    return [
      home,
      { href: "/prototype/produto", label: "Products" },
      { href: "/prototype/produto", label: "Dynamic Joint" },
      { href: pathname, label: "Landing page" },
    ];
  }
  if (pathname.startsWith("/prototype/produto")) {
    return [home, { href: "/prototype/produto", label: "Products" }, { href: pathname, label: "Dynamic Joint" }];
  }
  if (pathname.startsWith("/prototype/oportunidade")) {
    return [home, { href: pathname, label: "Oportunidades" }];
  }
  if (pathname.startsWith("/prototype/campanhas/")) {
    return [home, { href: "/prototype/campanhas", label: "Campanhas" }, { href: pathname, label: "Joint Pain Test" }];
  }
  if (pathname.startsWith("/prototype/campanhas")) {
    return [home, { href: pathname, label: "Campanhas" }];
  }
  if (pathname.startsWith("/prototype/relatorios")) {
    return [home, { href: pathname, label: "Relatórios" }];
  }
  if (pathname.startsWith("/prototype/configuracoes")) {
    return [home, { href: pathname, label: "Configurações" }];
  }
  return [home];
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const current = active(pathname, item.href, "exact" in item ? item.exact : false);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current ? "bg-card font-medium text-primary" : "text-foreground hover:bg-card",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PrototypeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div lang="pt-BR" className="min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2">
        Ir para o conteúdo
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 xl:px-6">
        <div className="flex items-center gap-3">
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger className="inline-flex h-10 items-center rounded-md border border-input px-3 text-sm xl:hidden">
              <Menu className="mr-2 h-4 w-4" aria-hidden />
              Menu
            </DialogTrigger>
            <DialogContent aria-label="Menu">
              <DialogTitle className="mb-4 pr-8 text-sm font-semibold">Plataforma</DialogTitle>
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </DialogContent>
          </Dialog>
          <Link href="/prototype" className="text-sm font-semibold">
            Plataforma
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline">{prototypeOperator}</span>
          <Link href="/prototype/configuracoes" className="rounded-md px-2 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Conta
          </Link>
        </div>
      </header>
      <div className="xl:grid xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background p-4 xl:block">
          <NavLinks pathname={pathname} />
        </aside>
        <div className="px-4 py-6 sm:px-6">
          <nav aria-label="Trilha" className="mb-4 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <li key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-1">
                    {index > 0 ? <span aria-hidden>&gt;</span> : null}
                    {last ? (
                      <span className="text-foreground">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href} className="text-[#175CD3] underline-offset-2 hover:underline">
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <p className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            Protótipo de navegação. Dados simulados. Nenhuma busca ou anúncio é enviado.
          </p>
          <main id="conteudo">{children}</main>
        </div>
      </div>
    </div>
  );
}
