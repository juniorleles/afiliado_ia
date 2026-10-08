import type { UiIconName } from "@/components/ui/icons";
import type { BreadcrumbItem } from "@/components/ui/breadcrumb";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: UiIconName;
  exact?: boolean;
  active?: (pathname: string) => boolean;
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
  if (item.active) return item.active(pathname);
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
  if (pathname.startsWith("/configuracoes/integracoes/google-ads")) {
    return [home, { label: "Configurações", href: "/configuracoes" }, { label: "Integrações", href: "/configuracoes/integracoes" }, { label: "Google Ads" }];
  }
  if (pathname.startsWith("/configuracoes/integracoes")) {
    return [home, { label: "Configurações", href: "/configuracoes" }, { label: "Integrações" }];
  }
  if (pathname === "/dashboard") return [{ label: "Início" }];
  const current = consoleNav.find((item) => isConsoleNavActive(pathname, item));
  if (!current) return [{ label: "Início" }];
  return [home, { label: current.label }];
}

const adminHome: BreadcrumbItem = { label: "Início", href: "/admin" };

function campaignTool(pathname: string): boolean {
  return pathname === "/admin/new" || pathname.startsWith("/admin/preview/") || /^\/admin\/\d+\/(edit|publish|lint)(\/|$)/.test(pathname);
}

export const adminNav: ConsoleNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/admin#campanhas", label: "Campanhas", icon: "campanhas", active: campaignTool },
  {
    href: "/admin#landing-pages",
    label: "Landing pages",
    icon: "landingPage",
    active: (pathname) => pathname.startsWith("/admin/lp-") || pathname.startsWith("/admin/visual-concepts/"),
  },
  { href: "/admin#produtos", label: "Produtos", icon: "produtos", active: (pathname) => pathname.startsWith("/admin/product-") },
  { href: "/admin/validation", label: "Validação", icon: "recommendation", active: (pathname) => pathname.startsWith("/admin/validation") },
  { href: "/admin#analises", label: "Análises", icon: "relatorios", active: (pathname) => /\/analytics(\/|$)/.test(pathname) },
  { href: "/admin/discovery", label: "Descoberta", icon: "search", active: (pathname) => pathname.startsWith("/admin/discovery") },
  { href: "/admin/system/readiness", label: "Sistema", icon: "configuracoes", active: (pathname) => pathname.startsWith("/admin/system") },
  { href: "/admin/google-ads/operacoes", label: "Google Ads", icon: "googleAds", active: (pathname) => pathname.startsWith("/admin/google-ads") },
];

export function adminCrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname === "/admin") return [{ label: "Início" }];
  if (pathname.startsWith("/admin/google-ads")) {
    return [
      { label: "Administração", href: "/admin" },
      { label: "Google Ads", href: "/admin/google-ads/operacoes" },
      { label: "Operações" },
    ];
  }
  if (/^\/admin\/\d+\/google-ads\/?$/.test(pathname)) {
    return [
      { label: "Administração", href: "/admin" },
      { label: "Campanhas", href: "/admin#campanhas" },
      { label: "Google Ads" },
    ];
  }
  if (/^\/admin\/\d+\/edit\/?$/.test(pathname)) {
    return [
      { label: "Administração", href: "/admin" },
      { label: "Campanhas", href: "/admin#campanhas" },
      { label: "Campanha" },
    ];
  }
  if (pathname.startsWith("/admin/validation")) return [adminHome, { label: "Validação" }];
  if (pathname.startsWith("/admin/discovery")) return [adminHome, { label: "Descoberta" }];
  if (pathname.startsWith("/admin/system")) return [adminHome, { label: "Sistema" }];
  if (pathname.startsWith("/admin/lp-") || pathname.startsWith("/admin/visual-concepts/")) return [adminHome, { label: "Landing pages" }];
  if (pathname.startsWith("/admin/product-")) return [adminHome, { label: "Produtos" }];
  if (/\/analytics(\/|$)/.test(pathname)) return [adminHome, { label: "Análises" }];
  if (campaignTool(pathname)) return [adminHome, { label: "Campanhas", href: "/admin#campanhas" }];
  return [adminHome, { label: "Administração" }];
}
