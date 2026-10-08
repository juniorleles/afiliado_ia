import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketSearchCard } from "@/components/operations/market-search-card";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleStore } from "@/lib/console/store";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { listCampaigns } from "@/lib/campaigns";
import { productionReadiness } from "@/lib/readiness";

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
  const localDrafts = store.readDrafts();
  const next = watchlist.find((item) => item.status === "analise" || item.status === "revisao") ?? watchlist[0] ?? null;
  const config = readIntegrationConfiguration();
  const health = productionReadiness();
  const pending = watchlist.filter((item) => item.status === "analise" || item.status === "revisao").length;
  const nextText = next
    ? `Continue com ${next.name} na Watchlist.`
    : latest
      ? "Revise os resultados da última pesquisa e escolha um produto."
      : "Pesquise um mercado para começar.";

  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-24">
      <header>
        <h1 className="text-h1">{greeting(now)}</h1>
        <p className="mt-ds-8 text-body text-foreground">Hoje é {weekday}.</p>
      </header>
      <section aria-labelledby="next-heading">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-ds-12">
            <div>
              <h2 id="next-heading" className="text-h3">O que fazer agora</h2>
              <p className="mt-ds-8 text-body">{nextText}</p>
            </div>
            {next ? <Button asChild><Link href={`/lista/produto?id=${encodeURIComponent(next.id)}`}>Continuar</Link></Button> : <Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>}
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="market-search-heading">
        <MarketSearchCard recentSearches={searches.slice(0, 10).map((item) => ({ id: item.id, keyword: item.keyword }))} />
      </section>
      <section aria-labelledby="kpis-heading">
        <SectionHeader id="kpis-heading" title="Resumo" description="Contagens gravadas nesta instalação." />
        <div className="mt-ds-16 grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard subject="Pesquisas hoje" value={String(searchesToday)} period="Hoje" />
          <MetricCard subject="Produtos da última busca" value={String(latest?.products.length ?? 0)} period="Última busca" />
          <MetricCard subject="Watchlist" value={String(watchlist.length)} period="Itens" />
          <MetricCard subject="Campanhas" value={String(drafts + active)} period={`${drafts} rascunhos · ${active} publicadas`} />
        </div>
      </section>
      <div className="grid gap-ds-16 lg:grid-cols-2">
        <section aria-labelledby="searches-heading">
          <Card>
            <CardContent>
              <h2 id="searches-heading" className="text-h3">Últimas pesquisas</h2>
              {searches.length === 0 ? <p className="mt-ds-12 text-body text-muted-foreground">Nenhuma busca gravada.</p> : (
                <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                  {searches.slice(0, 5).map((item) => (
                    <li key={item.id}><Link href={`/pesquisa/resultado?busca=${encodeURIComponent(item.id)}`}>{item.keyword}</Link></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="watch-heading">
          <Card>
            <CardContent>
              <h2 id="watch-heading" className="text-h3">Watchlist</h2>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                <li>{watchlist.length} itens</li>
                <li>{watchlist.filter((item) => item.status === "analise").length} em análise</li>
                <li>{watchlist.filter((item) => item.status === "pronto").length} prontos para anunciar</li>
              </ul>
              <Button asChild variant="secondary" className="mt-ds-12"><Link href="/lista">Abrir Watchlist</Link></Button>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="campaigns-heading">
          <Card>
            <CardContent>
              <h2 id="campaigns-heading" className="text-h3">Campanhas</h2>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                <li>{localDrafts.length} rascunhos locais</li>
                <li>{drafts} rascunhos gravados</li>
                <li>{active} publicadas</li>
              </ul>
              <Button asChild variant="secondary" className="mt-ds-12"><Link href="/campanhas">Abrir campanhas</Link></Button>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="pending-heading">
          <Card>
            <CardContent>
              <h2 id="pending-heading" className="text-h3">Ações pendentes</h2>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                <li>{pending} itens da Watchlist pedem uma decisão</li>
                <li>{latest?.missingEvidence.length ?? 0} campos em falta na última busca</li>
                <li>{localDrafts.length} rascunhos ainda não publicados</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
      <section aria-labelledby="status-heading">
        <Card>
          <CardContent>
            <h2 id="status-heading" className="text-h3">Estado do sistema</h2>
            <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
              <li>SearchApi: {config.searchApi === "SET" ? "Configurado" : "Ausente"}</li>
              <li>Google Ads: {config.googleAds === "Connected" ? "Conectado" : "Não conectado"}</li>
              <li>Banco: {health.DATABASE === "READY" ? "Pronto" : "Ausente"}</li>
            </ul>
            <Button asChild variant="secondary" className="mt-ds-12"><Link href="/configuracoes">Ver configurações</Link></Button>
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="actions-heading">
        <SectionHeader id="actions-heading" title="Ações rápidas" />
        <div className="mt-ds-16 flex flex-wrap gap-ds-8">
          <Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>
          <Button asChild variant="secondary"><Link href="/produtos">Ver produtos</Link></Button>
          <Button asChild variant="secondary"><Link href="/lista">Abrir Watchlist</Link></Button>
          <Button asChild variant="secondary"><Link href="/campanhas">Ver campanhas</Link></Button>
          <Button asChild variant="secondary"><Link href="/relatorios">Ver relatórios</Link></Button>
        </div>
      </section>
      {latest && latest.products.length > 0 ? (
        <section aria-labelledby="latest-products-heading">
          <SectionHeader id="latest-products-heading" title="Produtos da última pesquisa" description={latest.recommendation ? `Recomendação: ${latest.recommendation}` : "Ainda não há uma recomendação calculada."} />
          <div className="mt-ds-16 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>País</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell><Link href={`/pesquisa/resultado/detalhe?busca=${encodeURIComponent(latest.id)}&produto=${encodeURIComponent(product.id)}`}>{product.name}</Link></TableCell>
                    <TableCell>{product.brand ?? "Não observada"}</TableCell>
                    <TableCell>{product.priceLabel ?? "Não observado"}</TableCell>
                    <TableCell>{latest.country}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
