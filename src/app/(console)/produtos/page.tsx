import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTemplate } from "@/components/layout/page-template";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exampleOffers } from "@/lib/ui/shell-examples";

export const metadata: Metadata = { title: "Products" };

export default function ProdutosPage() {
  return (
    <PageTemplate
      title="Products"
      description="Lista de exemplo. Nenhum Product foi observado nesta página."
      primaryAction={
        <Button asChild>
          <Link href="/campanhas">Ver campanhas</Link>
        </Button>
      }
    >
      <Table>
        <caption className="sr-only">Products de exemplo</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exampleOffers.map((offer) => (
            <TableRow key={offer.name}>
              <TableCell>{offer.name}</TableCell>
              <TableCell>
                <Badge status={offer.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageTemplate>
  );
}
