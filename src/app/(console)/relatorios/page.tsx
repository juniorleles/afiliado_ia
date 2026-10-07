import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PageTemplate } from "@/components/layout/page-template";

export const metadata: Metadata = { title: "Monitoramento" };

export default function RelatoriosPage() {
  return (
    <PageTemplate
      title="Monitoramento"
      description="Leitura de exemplo. Estes números não foram coletados."
      primaryAction={
        <Button asChild variant="secondary">
          <Link href="/campanhas">Voltar às campanhas</Link>
        </Button>
      }
    >
      <div className="grid gap-ds-16 sm:grid-cols-3">
        <MetricCard subject="Visitas" value="128" period="Exemplo" />
        <MetricCard subject="Cliques no botão" value="14" period="Exemplo" />
        <MetricCard subject="Compras" value="2" period="Exemplo" />
      </div>
    </PageTemplate>
  );
}
