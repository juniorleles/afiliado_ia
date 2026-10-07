import type { Metadata } from "next";
import { MarketResultsView } from "@/components/operations/market-results-view";
import { marketSummary } from "@/lib/ui/market-results";

export const metadata: Metadata = { title: "Resultados do mercado" };

export default async function MarketResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; country?: string; language?: string; device?: string }>;
}) {
  const params = await searchParams;
  return <MarketResultsView summary={marketSummary(params)} />;
}
