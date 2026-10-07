import type { UiIconName } from "@/components/ui/icons";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: UiIconName;
  exact?: boolean;
};

export const consoleNav: ConsoleNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/pesquisa", label: "Pesquisa de Mercado", icon: "pesquisa" },
  { href: "/produtos", label: "Products", icon: "produtos" },
  { href: "/lista", label: "Lista de decisão", icon: "lista" },
  { href: "/oportunidades", label: "Oportunidades", icon: "opportunity" },
  { href: "/campanhas", label: "Campanhas", icon: "campanhas" },
  { href: "/relatorios", label: "Relatórios", icon: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "configuracoes" },
];

export function isConsoleNavActive(pathname: string, item: ConsoleNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
