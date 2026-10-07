import type { Metadata } from "next";
import { WatchlistProductPreview } from "@/components/operations/watchlist-view";

export const metadata: Metadata = { title: "Product da fila" };

export default async function WatchlistProductPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  return <WatchlistProductPreview productId={produto} />;
}
