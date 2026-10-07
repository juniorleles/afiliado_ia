import type { Metadata } from "next";
import { WatchlistView } from "@/components/operations/watchlist-view";

export const metadata: Metadata = { title: "Lista de decisão" };

export default function WatchlistPage() {
  return <WatchlistView />;
}
