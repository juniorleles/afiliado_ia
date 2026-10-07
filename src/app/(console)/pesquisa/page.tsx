import type { Metadata } from "next";
import { MarketSearchCard } from "@/components/operations/market-search-card";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Pesquisa de Mercado" };
export const dynamic = "force-dynamic";

export default function PesquisaPage() {
  const searches = consoleStore().listSearches();
  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <h1 className="text-h1">Pesquisa de Mercado</h1>
      <MarketSearchCard recentSearches={searches.slice(0, 10).map((item) => ({ id: item.id, keyword: item.keyword }))} />
    </div>
  );
}
