import {
  BarChart3,
  FileText,
  Folder,
  LayoutGrid,
  Lightbulb,
  LineChart,
  Megaphone,
  Package,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const uiIcons = {
  dashboard: LayoutGrid,
  pesquisa: Search,
  produtos: Package,
  campanhas: Folder,
  relatorios: LineChart,
  configuracoes: SlidersHorizontal,
  googleAds: Megaphone,
  search: Search,
  landingPage: FileText,
  opportunity: BarChart3,
  recommendation: Lightbulb,
} as const satisfies Record<string, LucideIcon>;

export type UiIconName = keyof typeof uiIcons;

export const uiIconLabels: Record<UiIconName, string> = {
  dashboard: "Dashboard",
  pesquisa: "Pesquisa",
  produtos: "Produtos",
  campanhas: "Campanhas",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  googleAds: "Google Ads",
  search: "Search",
  landingPage: "Landing page",
  opportunity: "Opportunity",
  recommendation: "Recommendation",
};

export function UiIcon({
  name,
  size = 16,
  className,
}: {
  name: UiIconName;
  size?: 16 | 20;
  className?: string;
}) {
  const Icon = uiIcons[name];
  return <Icon aria-hidden className={cn("shrink-0", className)} size={size} strokeWidth={1.5} />;
}
