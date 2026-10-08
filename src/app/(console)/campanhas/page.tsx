import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTemplate } from "@/components/layout/page-template";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NoCampaignsEmpty } from "@/components/ui/empty-state";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { consoleStore } from "@/lib/console/store";
import { listCampaigns } from "@/lib/campaigns";

export const metadata: Metadata = { title: "Campanhas" };
export const dynamic = "force-dynamic";

function adsLabel(value: "Not Connected" | "Connected") {
  return value === "Connected" ? "Conectado" : "Não conectado";
}

export default function CampanhasPage() {
  const googleAds = readIntegrationConfiguration().googleAds;
  const drafts = consoleStore().readDrafts();
  let campaigns: { id: number; name: string; publicationStatus: string; slug: string }[] = [];
  try {
    campaigns = listCampaigns();
  } catch {
    campaigns = [];
  }
  return (
    <PageTemplate
      title="Campanhas"
      description="Rascunhos, estado, publicação e Google Ads. Nenhum anúncio é enviado desta tela."
      primaryAction={<Button asChild variant="secondary"><Link href="/lista">Abrir Watchlist</Link></Button>}
    >
      <p className="text-body">Google Ads: {adsLabel(googleAds)}</p>
      <h2 className="mt-ds-16 text-h3">Rascunhos</h2>
      {drafts.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Ainda não há um rascunho local.</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Publicar</TableHead>
              <TableHead>Analytics</TableHead>
              <TableHead>Google Ads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => (
              <TableRow key={draft.id}>
                <TableCell><Link href={`/lista/rascunho?id=${encodeURIComponent(draft.id)}`}>{draft.name}</Link></TableCell>
                <TableCell><Badge tone="warning">Rascunho</Badge></TableCell>
                <TableCell>Aguardando publicação</TableCell>
                <TableCell>Sem métricas</TableCell>
                <TableCell>{adsLabel(draft.googleAds)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <h2 className="mt-ds-24 text-h3">Campanhas gravadas</h2>
      {campaigns.length === 0 ? <NoCampaignsEmpty /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Publicar</TableHead>
              <TableHead>Analytics</TableHead>
              <TableHead>Google Ads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => {
              const published = campaign.publicationStatus === "published";
              return (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.name}</TableCell>
                  <TableCell><Badge tone={published ? "success" : "warning"}>{published ? "Publicada" : "Rascunho"}</Badge></TableCell>
                  <TableCell>{published ? "Publicada" : <Link href={`/admin/${campaign.id}/publish`}>Publicar</Link>}</TableCell>
                  <TableCell><Link href={`/admin/${campaign.id}/analytics`}>Analytics</Link></TableCell>
                  <TableCell>{adsLabel(googleAds)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </PageTemplate>
  );
}
