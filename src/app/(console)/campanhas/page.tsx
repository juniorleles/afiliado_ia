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
      description={`Google Ads: ${googleAds}. Nenhum anúncio é enviado desta tela.`}
      primaryAction={<Button asChild variant="secondary"><Link href="/lista">Abrir a fila</Link></Button>}
    >
      <p className="text-body">{googleAds === "Connected" ? "A conta está configurada. Esta tela não publica." : "Not Connected"}</p>
      <h2 className="mt-ds-16 text-h3">Rascunhos pausados</h2>
      {drafts.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Ainda não há um rascunho local.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Estado</TableHead><TableHead>Google Ads</TableHead></TableRow></TableHeader>
          <TableBody>
            {drafts.map((draft) => (
              <TableRow key={draft.id}>
                <TableCell><Link href={`/lista/rascunho?id=${encodeURIComponent(draft.id)}`}>{draft.name}</Link></TableCell>
                <TableCell>{draft.status}</TableCell>
                <TableCell>{draft.googleAds}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <h2 className="mt-ds-24 text-h3">Campanhas gravadas</h2>
      {campaigns.length === 0 ? <NoCampaignsEmpty /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell>{campaign.name}</TableCell>
                <TableCell><Badge tone={campaign.publicationStatus === "published" ? "success" : "warning"}>{campaign.publicationStatus === "published" ? "Publicada" : "Rascunho"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageTemplate>
  );
}
