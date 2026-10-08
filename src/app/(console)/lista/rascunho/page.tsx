import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Rascunho de campanha" };
export const dynamic = "force-dynamic";

export default async function RascunhoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const draft = consoleStore().readDrafts().find((item) => item.id === id) ?? consoleStore().readDrafts()[0] ?? null;
  if (!draft) {
    return <div className="ds-container py-ds-24"><h1 className="text-h1">Rascunho de campanha</h1><p className="mt-ds-8 text-body">Ainda não há um rascunho.</p></div>;
  }
  return (
    <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
      <h1 className="text-h1">Rascunho de campanha</h1>
      <p className="text-body text-muted-foreground">Nenhum anúncio é enviado. Google Ads: {draft.googleAds}.</p>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-12 sm:grid-cols-2">
            <div><dt className="text-caption text-muted-foreground">Produto</dt><dd>{draft.name}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Palavra-chave</dt><dd>{draft.keyword}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Estado</dt><dd>{draft.status}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Envio</dt><dd>{draft.sent ? "Enviado" : "Não enviado"}</dd></div>
          </dl>
          {draft.issues.length > 0 ? <p className="mt-ds-16 text-caption text-muted-foreground">O validador recusou o envio: {draft.issues[0]}</p> : null}
        </CardContent>
      </Card>
      <Button asChild variant="secondary"><Link href="/campanhas">Ver campanhas</Link></Button>
    </div>
  );
}
