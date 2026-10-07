import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTemplate } from "@/components/layout/page-template";
import { NoProductsEmpty } from "@/components/ui/empty-state";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default function ProdutosPage() {
  const searches = consoleStore().listSearches();
  const rows = searches.flatMap((search) => search.products.map((product) => ({ search, product })));
  return (
    <PageTemplate title="Products" description="Products observados nas buscas gravadas." primaryAction={<Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>}>
      {rows.length === 0 ? <NoProductsEmpty /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Keyword</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ search, product }) => (
              <TableRow key={`${search.id}-${product.id}`}>
                <TableCell><Link href={`/pesquisa/resultado/detalhe?busca=${encodeURIComponent(search.id)}&produto=${encodeURIComponent(product.id)}`}>{product.name}</Link></TableCell>
                <TableCell>{product.brand ?? "Não observada"}</TableCell>
                <TableCell>{product.priceLabel ?? "Não observado"}</TableCell>
                <TableCell>{search.keyword}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageTemplate>
  );
}
