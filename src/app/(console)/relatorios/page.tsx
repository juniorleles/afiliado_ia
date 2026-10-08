import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { NoReportsEmpty } from "@/components/ui/empty-state";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default function RelatoriosPage() {
  const latest = consoleStore().listSearches()[0] ?? null;
  const googleAds = readIntegrationConfiguration().googleAds;
  if (latest === null) {
    return (
      <PageTemplate title="Relatórios" description="Leituras das pesquisas gravadas." primaryAction={null}>
        <NoReportsEmpty />
      </PageTemplate>
    );
  }
  const blocks = [
    ["Mercado", `${latest.sponsoredCount} patrocinados, ${latest.organicCount} orgânicos, ${latest.brands.length} marcas.`],
    ["Produto", `${latest.products.length} produtos observados.`],
    ["Oportunidade", latest.recommendation ?? "Sem recomendação nesta busca."],
    ["Otimização", googleAds === "Connected" ? "A conta está configurada. Nenhuma métrica foi coletada." : "Não conectado"],
    ["Execução", `${latest.elapsedMs} ms · pontuação ${latest.score ?? "não calculada"} · posição ${latest.rank ?? "não calculada"}.`],
  ] as const;
  return (
    <PageTemplate title="Relatórios" description={`Última pesquisa: ${latest.keyword}.`} primaryAction={<Button asChild variant="secondary"><Link href={`/pesquisa/resultado?busca=${encodeURIComponent(latest.id)}`}>Ver resultados</Link></Button>}>
      <div className="grid gap-ds-12 md:grid-cols-2">
        {blocks.map(([title, body]) => (
          <Card key={title}><CardContent><h2 className="text-h3">{title}</h2><p className="mt-ds-8 text-body">{body}</p></CardContent></Card>
        ))}
      </div>
      <p className="mt-ds-16 text-body"><Link href="/oportunidades">Ver a oportunidade desta pesquisa</Link></p>
    </PageTemplate>
  );
}
