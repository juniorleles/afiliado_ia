import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { NoOpportunitiesEmpty } from "@/components/ui/empty-state";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Oportunidades" };
export const dynamic = "force-dynamic";

export default function OportunidadesPage() {
  const searches = consoleStore().listSearches().filter((item) => item.recommendation !== null || item.score !== null);
  return (
    <PageTemplate title="Oportunidades" description="Ranking e recomendação calculados pelos motores existentes." primaryAction={<Button asChild variant="secondary"><Link href="/pesquisa">Pesquisar Mercado</Link></Button>}>
      {searches.length === 0 ? <NoOpportunitiesEmpty /> : (
        <ul className="flex flex-col gap-ds-12">
          {searches.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent>
                  <h2 className="text-h3">{item.keyword}</h2>
                  <p className="mt-ds-8 text-body">Recomendação: {item.recommendation ?? "Sem recomendação"}</p>
                  <p className="mt-ds-4 text-caption text-muted-foreground">Score {item.score ?? "não calculado"} · Ranking {item.rank ?? "não calculado"} · {item.products.length} Products</p>
                  <Button asChild variant="secondary" className="mt-ds-12"><Link href={`/pesquisa/resultado?busca=${encodeURIComponent(item.id)}`}>Ver resultados</Link></Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageTemplate>
  );
}
