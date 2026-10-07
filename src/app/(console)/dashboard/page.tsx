import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketSearchCard } from "@/components/operations/market-search-card";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleStore } from "@/lib/console/store";
import { listCampaigns } from "@/lib/campaigns";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function DashboardPage() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" }).format(now);
  const store = consoleStore();
  const searches = store.listSearches();
  const watchlist = store.readWatchlist();
  const latest = searches[0] ?? null;
  const today = now.toISOString().slice(0, 10);
  const searchesToday = searches.filter((item) => item.createdAt.slice(0, 10) === today).length;
  let campaigns: { id: number; name: string; publicationStatus: string; updatedAt: string }[] = [];
  try {
    campaigns = listCampaigns();
  } catch {
    campaigns = [];
  }
  const active = campaigns.filter((item) => item.publicationStatus === "published").length;
  const drafts = campaigns.filter((item) => item.publicationStatus !== "published").length;
  const next = watchlist.find((item) => item.status === "analise") ?? watchlist[0] ?? null;

  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-24">
      <header>
        <h1 className="text-h1">{greeting(now)}</h1>
        <p className="mt-ds-8 text-body text-foreground">Hoje é {weekday}.</p>
        <p className="mt-ds-4 text-body text-muted-foreground">Vamos encontrar oportunidades?</p>
      </header>
      <section aria-labelledby="market-search-heading">
        <MarketSearchCard recentSearches={searches.slice(0, 10).map((item) => ({ id: item.id, keyword: item.keyword }))} />
      </section>
      <section aria-labelledby="kpis-heading">
        <SectionHeader id="kpis-heading" title="Indicadores" description="Contagens gravadas nesta instalação." />
        <div className="mt-ds-16 grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard subject="Pesquisar hoje" value={String(searchesToday)} period="Hoje" />
          <MetricCard subject="Produtos encontrados" value={String(latest?.products.length ?? 0)} period="Última busca" />
          <MetricCard subject="Produtos na fila" value={String(watchlist.length)} period="Fila" />
          <MetricCard subject="Campanhas em rascunho" value={String(drafts)} period="Base local" />
          <MetricCard subject="Campanhas ativas" value={String(active)} period="Publicadas" />
        </div>
      </section>
      <section aria-labelledby="actions-heading">
        <SectionHeader id="actions-heading" title="Ações principais" />
        <div className="mt-ds-16 flex flex-wrap gap-ds-8">
          <Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>
          <Button asChild variant="secondary"><Link href="/campanhas">Criar Campanha</Link></Button>
          <Button asChild variant="secondary"><Link href="/produtos">Ver Produtos</Link></Button>
          <Button asChild variant="secondary"><Link href="/relatorios">Ver Relatórios</Link></Button>
        </div>
      </section>
      <div className="grid gap-ds-16 lg:grid-cols-2">
        <section aria-labelledby="attention-heading">
          <Card>
            <CardContent>
              <h2 id="attention-heading" className="text-h3">Atenção</h2>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                <li>{watchlist.filter((item) => item.status === "analise").length} produtos aguardando análise</li>
                <li>{watchlist.filter((item) => item.status === "pronto").length} produtos prontos para anunciar</li>
                <li>{latest?.missingEvidence.length ?? 0} campos em falta na última busca</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="activity-heading">
          <Card>
            <CardContent>
              <h2 id="activity-heading" className="text-h3">Atividade recente</h2>
              {searches.length === 0 && campaigns.length === 0 ? <p className="mt-ds-12 text-body text-muted-foreground">Ainda não há atividade gravada.</p> : (
                <ol className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                  {searches.slice(0, 4).map((item) => <li key={item.id}>Pesquisa · {item.keyword}</li>)}
                  {campaigns.slice(0, 2).map((item) => <li key={item.id}>Campanha · {item.name}</li>)}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
      <section aria-labelledby="next-heading">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-ds-12">
            <div>
              <h2 id="next-heading" className="text-h3">Próximo passo</h2>
              <p className="mt-ds-8 text-body">{next ? next.name : "Pesquise um mercado para escolher um Product."}</p>
            </div>
            {next ? <Button asChild><Link href={`/lista/produto?id=${encodeURIComponent(next.id)}`}>Continuar</Link></Button> : <Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>}
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="opportunities-heading">
        <SectionHeader id="opportunities-heading" title="Oportunidades recentes" description={latest?.recommendation ? `Recomendação da última busca: ${latest.recommendation}` : "Ainda não há uma recomendação calculada."} />
        <div className="mt-ds-16 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>País</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(latest?.products ?? []).map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.brand ?? "Não observada"}</TableCell>
                  <TableCell>{product.priceLabel ?? "Não observado"}</TableCell>
                  <TableCell>{latest?.country}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {latest === null ? <p className="mt-ds-12 text-body text-muted-foreground">Nenhuma busca gravada.</p> : null}
        </div>
      </section>
    </div>
  );
}
