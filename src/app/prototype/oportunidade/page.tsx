import { PageIntro, PrimaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prototypeProduct, prototypeSearch } from "@/lib/prototype/mock";

export default function OpportunityPage() {
  return (
    <>
      <PageIntro
        title="Oportunidades desta pesquisa"
        lede={`Keyword ${prototypeSearch.keyword}.`}
        action={<PrimaryLink href="/prototype/campanhas/joint-pain-test">Criar campanha</PrimaryLink>}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Posição</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Recomendação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
            <TableCell className="font-semibold">{prototypeProduct.name}</TableCell>
            <TableCell>
              <Badge tone="info">{prototypeProduct.recommendation}</Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent>
            <CardTitle>Idioma observado</CardTitle>
            <p className="mt-2 text-lg font-semibold">{prototypeSearch.language}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>País observado</CardTitle>
            <p className="mt-2 text-lg font-semibold">{prototypeSearch.country}</p>
          </CardContent>
        </Card>
      </div>
      <TechnicalDetails />
    </>
  );
}
