import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarketResultsView } from "@/components/operations/market-results-view";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Resultados do mercado" };
export const dynamic = "force-dynamic";

export default async function ResultadoPage({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca } = await searchParams;
  const store = consoleStore();
  const record = (busca ? store.getSearch(busca) : null) ?? store.listSearches()[0] ?? null;
  if (record === null) {
    return (
      <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
        <h1 className="text-h1">Resultados do mercado</h1>
        <p className="text-body text-muted-foreground">Ainda não há uma busca gravada.</p>
        <Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>
      </div>
    );
  }
  const savedIds = store.readWatchlist().map((item) => item.id);
  return <MarketResultsView record={record} savedIds={savedIds} />;
}
