import type { UiIconName } from "@/components/ui/icons";
import type { BreadcrumbItem } from "@/components/ui/breadcrumb";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: UiIconName;
  exact?: boolean;
};

export const consoleNav: ConsoleNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/pesquisa", label: "Pesquisa de Mercado", icon: "pesquisa" },
  { href: "/produtos", label: "Produtos", icon: "produtos" },
  { href: "/lista", label: "Watchlist", icon: "lista" },
  { href: "/campanhas", label: "Campanhas", icon: "campanhas" },
  { href: "/relatorios", label: "Relatórios", icon: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "configuracoes" },
];

export function isConsoleNavActive(pathname: string, item: ConsoleNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const home: BreadcrumbItem = { label: "Início", href: "/dashboard" };

export function operatorCrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname.startsWith("/pesquisa/resultado/landing-page")) {
    return [home, { label: "Pesquisa de Mercado", href: "/pesquisa" }, { label: "Resultados", href: "/pesquisa/resultado" }, { label: "Landing page" }];
  }
  if (pathname.startsWith("/pesquisa/resultado/detalhe")) {
    return [home, { label: "Pesquisa de Mercado", href: "/pesquisa" }, { label: "Resultados", href: "/pesquisa/resultado" }, { label: "Produto" }];
  }
  if (pathname.startsWith("/pesquisa/resultado")) {
    return [home, { label: "Pesquisa de Mercado", href: "/pesquisa" }, { label: "Resultados" }];
  }
  if (pathname.startsWith("/pesquisa")) return [home, { label: "Pesquisa de Mercado" }];
  if (pathname.startsWith("/lista/landing-page")) return [home, { label: "Watchlist", href: "/lista" }, { label: "Landing page" }];
  if (pathname.startsWith("/lista/produto")) return [home, { label: "Watchlist", href: "/lista" }, { label: "Produto" }];
  if (pathname.startsWith("/lista/rascunho")) return [home, { label: "Watchlist", href: "/lista" }, { label: "Rascunho" }];
  if (pathname.startsWith("/lista")) return [home, { label: "Watchlist" }];
  if (pathname.startsWith("/oportunidades")) return [home, { label: "Relatórios", href: "/relatorios" }, { label: "Oportunidade" }];
  if (pathname === "/dashboard") return [{ label: "Início" }];
  const current = consoleNav.find((item) => isConsoleNavActive(pathname, item));
  if (!current) return [{ label: "Início" }];
  return [home, { label: current.label }];
}
