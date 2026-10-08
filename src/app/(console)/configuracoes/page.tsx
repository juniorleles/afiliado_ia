import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageTemplate } from "@/components/layout/page-template";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { productionReadiness, type ReadinessFlag } from "@/lib/readiness";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const healthLabel: Record<string, string> = {
  DATABASE: "Banco de dados",
  MEDIA_STORAGE: "Mídia",
  APP_BASE_URL: "Endereço do site",
  HTTPS_CONFIG: "HTTPS",
  CLICKBANK_INS: "ClickBank",
  AI_PROVIDER: "Provedor de IA",
  ADMIN_AUTH: "Acesso administrativo",
  MIGRATIONS: "Migrações",
  BACKUP_STRATEGY: "Backup",
  ENV: "Ambiente",
};

function flagLabel(value: ReadinessFlag | string) {
  if (value === "READY") return "Pronto";
  if (value === "OPTIONAL") return "Opcional";
  if (value === "MISSING") return "Ausente";
  return value;
}

export default function ConfiguracoesPage() {
  const config = readIntegrationConfiguration();
  const health = productionReadiness();
  const rows = [
    ["Idioma do console", config.language],
    ["Idioma público", config.publicLanguage],
    ["Tema", "Claro, escuro ou sistema, no topo da página"],
    ["SearchApi", config.searchApi === "SET" ? "Configurado" : "Ausente"],
    ["Google Ads", config.googleAds === "Connected" ? "Conectado" : "Não conectado"],
  ] as const;
  return (
    <PageTemplate title="Configurações" description="Estado da configuração. Nenhum segredo é mostrado." primaryAction={null}>
      <ul className="flex flex-col gap-ds-12">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center justify-between gap-ds-12">
            <span className="text-body">{label}</span>
            <Badge tone={value === "Ausente" || value === "Não conectado" ? "warning" : "success"}>{value}</Badge>
          </li>
        ))}
      </ul>
      <section aria-labelledby="diagnostics-heading" className="mt-ds-32">
        <h2 id="diagnostics-heading" className="text-h3">Diagnóstico do sistema</h2>
        <p className="mt-ds-8 text-body text-muted-foreground">Saúde da instalação. Os valores de configuração não aparecem aqui.</p>
        <ul className="mt-ds-16 flex flex-col gap-ds-12">
          {Object.entries(health).map(([key, value]) => (
            <li key={key} className="flex items-center justify-between gap-ds-12">
              <span className="text-body">{healthLabel[key] ?? key}</span>
              <Badge tone={value === "MISSING" ? "warning" : "success"}>{flagLabel(String(value))}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-ds-16 text-body">
          <Link href="/admin/system/readiness">Abrir a central do sistema</Link>
        </p>
      </section>
    </PageTemplate>
  );
}
