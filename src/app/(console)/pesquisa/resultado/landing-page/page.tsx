import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Landing Page" };
export const dynamic = "force-dynamic";

export default async function LandingPreviewPage({ searchParams }: { searchParams: Promise<{ busca?: string; produto?: string }> }) {
  const { busca, produto } = await searchParams;
  const store = consoleStore();
  const record = busca ? store.getSearch(busca) : null;
  const page = record?.landingPages.find((item) => item.id === produto) ?? null;
  const html = record && page ? store.readPage(record.id, page.id) : null;
  if (!record || !page) {
    return (
      <div className="ds-container py-ds-24">
        <h1 className="text-h1">Landing Page</h1>
        <p className="mt-ds-8 text-body text-muted-foreground">Esta Landing Page não está na busca gravada.</p>
      </div>
    );
  }
  return (
    <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
      <header className="flex flex-col gap-ds-8">
        <h1 className="text-h1">Landing Page</h1>
        <p className="text-body text-muted-foreground">HTTP {page.httpStatus} · {page.redirectCount} redirecionamentos · {page.bytes} bytes</p>
        <p className="text-caption text-muted-foreground">A pré-visualização não publica a página e não envia uma visita.</p>
        <Button asChild variant="secondary"><Link href={`/pesquisa/resultado/detalhe?busca=${encodeURIComponent(record.id)}&produto=${encodeURIComponent(page.id)}`}>Voltar ao produto</Link></Button>
      </header>
      {html ? (
        <iframe title="Pré-visualização da Landing Page" sandbox="" srcDoc={html} className="h-[720px] w-full rounded-ds-md border border-border bg-card" />
      ) : (
        <p className="text-body text-muted-foreground">O HTML desta página não ficou gravado.</p>
      )}
    </div>
  );
}
