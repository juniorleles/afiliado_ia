import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageTemplate } from "@/components/layout/page-template";
import { readIntegrationConfiguration } from "@/lib/console/configuration";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default function ConfiguracoesPage() {
  const config = readIntegrationConfiguration();
  const rows = [
    ["Idioma do console", config.language],
    ["Idioma público", config.publicLanguage],
    ["Tema", "Claro, escuro ou sistema, no topo da página"],
    ["SearchApi", config.searchApi === "SET" ? "Configurado" : "MISSING"],
    ["Google Ads", config.googleAds],
    ["DEMO_PUBLISH", config.demoPublish],
  ] as const;
  return (
    <PageTemplate title="Configurações" description="Estado da configuração. Nenhum segredo é mostrado." primaryAction={null}>
      <ul className="flex flex-col gap-ds-12">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center justify-between gap-ds-12">
            <span className="text-body">{label}</span>
            <Badge tone={value === "MISSING" || value === "Not Connected" ? "warning" : "success"}>{value}</Badge>
          </li>
        ))}
      </ul>
    </PageTemplate>
  );
}
