import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WatchlistActions } from "@/components/operations/watchlist-actions";
import { consoleStore } from "@/lib/console/store";
import type { WatchStatus } from "@/lib/console/types";

export const metadata: Metadata = { title: "Product" };
export const dynamic = "force-dynamic";

const statusView: Record<WatchStatus, { tone: "success" | "warning" | "review" | "danger"; label: string }> = {
  pronto: { tone: "success", label: "Pronto para anunciar" },
  analise: { tone: "warning", label: "Em análise" },
  revisao: { tone: "review", label: "Aguardando revisão" },
  descartado: { tone: "danger", label: "Descartado" },
};

export default async function ListaProdutoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const item = consoleStore().readWatchlist().find((entry) => entry.id === id) ?? null;
  if (!item) {
    return <div className="ds-container py-ds-24"><h1 className="text-h1">Product</h1><p className="mt-ds-8 text-body">Este Product não está na fila.</p></div>;
  }
  const status = statusView[item.status];
  return (
    <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
      <div className="flex flex-wrap items-start justify-between gap-ds-12">
        <h1 className="text-h1">{item.name}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-12 sm:grid-cols-2">
            <div><dt className="text-caption text-muted-foreground">Marca</dt><dd>{item.brand ?? "Não observada"}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Preço</dt><dd>{item.priceLabel ?? "Não observado"}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Keyword</dt><dd>{item.keyword}</dd></div>
            <div><dt className="text-caption text-muted-foreground">País</dt><dd>{item.country}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Domínio</dt><dd>{item.domain ?? "Não observado"}</dd></div>
          </dl>
          <p className="mt-ds-16 whitespace-pre-line text-body">{item.notes || "Sem nota."}</p>
          <h2 className="mt-ds-16 text-h3">Linha do tempo</h2>
          <ol className="mt-ds-8 flex flex-col gap-ds-4">
            {item.events.map((event) => <li key={`${event.at}-${event.label}`} className="text-body">{event.label}</li>)}
          </ol>
        </CardContent>
      </Card>
      <WatchlistActions item={item} />
      <Button asChild variant="secondary"><Link href="/lista">Voltar à fila</Link></Button>
    </div>
  );
}
