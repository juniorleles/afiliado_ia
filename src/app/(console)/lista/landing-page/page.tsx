import type { Metadata } from "next";
import { WatchlistLandingPreview } from "@/components/operations/watchlist-view";

export const metadata: Metadata = { title: "Landing page preview" };

export default async function WatchlistLandingPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  return <WatchlistLandingPreview productId={produto} />;
}
