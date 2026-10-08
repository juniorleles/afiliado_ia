import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Landing Page" };
export const dynamic = "force-dynamic";

export default async function ListaLandingPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const store = consoleStore();
  const item = store.readWatchlist().find((entry) => entry.id === id) ?? null;
  const html = item?.landingPageId ? store.readPage(item.searchId, item.landingPageId) : null;
  if (!item) {
    return <div className="ds-container py-ds-24"><h1 className="text-h1">Landing page</h1><p className="mt-ds-8 text-body">Este produto não está na Watchlist.</p></div>;
  }
  return (
    <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
      <h1 className="text-h1">Pré-visualização da Landing Page</h1>
      <p className="text-body text-muted-foreground">Esta pré-visualização não publica a página e não envia uma visita.</p>
      <Button asChild variant="secondary"><Link href={`/lista/produto?id=${encodeURIComponent(item.id)}`}>Voltar ao produto</Link></Button>
      {html ? <iframe title="Pré-visualização da Landing Page" sandbox="" srcDoc={html} className="h-[720px] w-full rounded-ds-md border border-border bg-card" /> : <p className="text-body">O HTML desta página não ficou gravado.</p>}
    </div>
  );
}
