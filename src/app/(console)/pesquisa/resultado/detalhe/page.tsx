import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { consoleStore } from "@/lib/console/store";

export const metadata: Metadata = { title: "Produto" };
export const dynamic = "force-dynamic";

export default async function DetalhePage({ searchParams }: { searchParams: Promise<{ busca?: string; produto?: string }> }) {
  const { busca, produto } = await searchParams;
  const record = busca ? consoleStore().getSearch(busca) : null;
  const product = record?.products.find((item) => item.id === produto) ?? null;
  if (!record || !product) {
    return (
      <div className="ds-container py-ds-24">
        <h1 className="text-h1">Produto</h1>
        <p className="mt-ds-8 text-body text-muted-foreground">Este produto não está na busca gravada.</p>
      </div>
    );
  }
  const facts = [
    ["Categoria", product.category],
    ["Marca", product.brand],
    ["Preço", product.priceLabel],
    ["Domínio", product.domain],
    ["Idioma", product.language],
    ["HTTP", product.httpStatus === null ? null : String(product.httpStatus)],
  ] as const;
  return (
    <div className="ds-container flex flex-col gap-ds-16 py-ds-24">
      <h1 className="text-h1">{product.name}</h1>
      <p className="text-caption text-muted-foreground">Campos copiados da página observada. Palavra-chave: {record.keyword}.</p>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-12 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}><dt className="text-caption text-muted-foreground">{label}</dt><dd className="text-body">{value ?? "Não observado"}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Button asChild variant="secondary"><Link href={`/pesquisa/resultado?busca=${encodeURIComponent(record.id)}`}>Voltar aos resultados</Link></Button>
    </div>
  );
}
