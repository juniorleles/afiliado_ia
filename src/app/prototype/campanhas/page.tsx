import Link from "next/link";
import { PageIntro, TechnicalDetails } from "@/components/prototype/blocks";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prototypeCampaign } from "@/lib/prototype/mock";

export default function CampaignsPage() {
  return (
    <>
      <PageIntro title="Campanhas" lede="Abra a campanha para revisar a presell e o Ad pausado." />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Próximo passo</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-semibold">{prototypeCampaign.name}</TableCell>
            <TableCell>
              <Badge tone="review">{prototypeCampaign.status}</Badge>
            </TableCell>
            <TableCell>{prototypeCampaign.next}</TableCell>
            <TableCell>
              <Link className="text-[#175CD3] underline-offset-2 hover:underline" href="/prototype/campanhas/joint-pain-test">
                Abrir
              </Link>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TechnicalDetails />
    </>
  );
}
