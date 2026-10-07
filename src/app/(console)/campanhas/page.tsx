import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTemplate } from "@/components/layout/page-template";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExampleConfirmButton } from "@/components/ux/example-confirm-button";
import { successMessages } from "@/lib/ui/feedback-messages";
import { exampleCampaigns } from "@/lib/ui/shell-examples";

export const metadata: Metadata = { title: "Campanhas" };

export default function CampanhasPage() {
  return (
    <PageTemplate
      title="Campanhas"
      description="Rascunhos de exemplo. Nenhum anúncio é enviado."
      primaryAction={
        <>
          <Button asChild>
            <Link href="/relatorios">Ver relatórios</Link>
          </Button>
          <ExampleConfirmButton
            label="Criar exemplo"
            title="Criar campanha"
            description="Nenhum anúncio é enviado. A confirmação fica nesta página."
            success={successMessages.campanha}
          />
        </>
      }
    >
      <Table>
        <caption className="sr-only">Campanhas de exemplo</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Campanha</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exampleCampaigns.map((campaign) => (
            <TableRow key={campaign.name}>
              <TableCell>{campaign.name}</TableCell>
              <TableCell>
                <Badge status={campaign.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageTemplate>
  );
}
