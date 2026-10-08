import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTemplate } from "@/components/layout/page-template";
import { NoProductsEmpty } from "@/components/ui/empty-state";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Produtos" };
export const dynamic = "force-dynamic";

export default function ProdutosPage() {
  const store = consoleStore();
  const searches = store.listSearches();
  const drafts = store.readDrafts();
  const rows = searches.flatMap((search) => search.products.map((product) => ({ search, product })));
  return (
    <PageTemplate title="Produtos" description="Produtos observados nas pesquisas gravadas." primaryAction={<Button asChild><Link href="/pesquisa">Pesquisar Mercado</Link></Button>}>
      {rows.length === 0 ? <NoProductsEmpty /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Evidência</TableHead>
              <TableHead>Recomendação</TableHead>
              <TableHead>Landing page</TableHead>
              <TableHead>Campanha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ search, product }) => {
              const draft = drafts.find((item) => item.searchId === search.id && item.productId === product.id);
              return (
                <TableRow key={`${search.id}-${product.id}`}>
                  <TableCell><Link href={`/pesquisa/resultado/detalhe?busca=${encodeURIComponent(search.id)}&produto=${encodeURIComponent(product.id)}`}>{product.name}</Link></TableCell>
                  <TableCell>{product.brand ?? "Não observada"}</TableCell>
                  <TableCell>{product.priceLabel ?? "Não observado"}</TableCell>
                  <TableCell>{product.category ?? "Não observada"}</TableCell>
                  <TableCell>{search.missingEvidence.length === 0 ? "Observada" : "Em falta"}</TableCell>
                  <TableCell>{search.recommendation ?? "Sem recomendação"}</TableCell>
                  <TableCell>{product.landingPageId ? <Link href={`/pesquisa/resultado/landing-page?busca=${encodeURIComponent(search.id)}&produto=${encodeURIComponent(product.id)}`}>Abrir</Link> : "Sem página"}</TableCell>
                  <TableCell>{draft ? "Rascunho" : "Sem campanha"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </PageTemplate>
  );
}
