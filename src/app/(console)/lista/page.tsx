import type { Metadata } from "next";
import { WatchlistView } from "@/components/operations/watchlist-view";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Lista de decisão" };
export const dynamic = "force-dynamic";

export default function ListaPage() {
  return <WatchlistView items={consoleStore().readWatchlist()} />;
}
