import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductQuickActions } from "@/components/operations/product-actions";
import { findMarketProduct, marketDecisionLabel, marketLevelLabel } from "@/lib/ui/market-results";

export const metadata: Metadata = { title: "Detalhe do Product" };

export default async function ProductDetailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  const { produto } = await searchParams;
  const product = findMarketProduct(produto);

  const facts = [
    ["Marca", product.brand],
    ["Preço", product.priceLabel],
    ["Landing Page", product.landingPage ? "Disponível" : "Indisponível"],
    ["Ads observados", String(product.observedAds)],
    ["Concorrência", marketLevelLabel[product.competition]],
    ["Recomendação", marketDecisionLabel[product.recommendation]],
    ["Confiança", `${product.confidence}%`],
    ["País", product.country],
  ] as const;

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12">
        <p className="text-caption text-muted-foreground">Pré-visualização do Product. Nenhum dado foi observado nesta página.</p>
        <div className="flex flex-wrap items-start justify-between gap-ds-12">
          <h1 className="text-h1">{product.name}</h1>
          <Badge status={product.badge} />
        </div>
        <Button asChild variant="secondary">
          <Link href="/pesquisa/resultado">Voltar aos resultados</Link>
        </Button>
      </header>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-16 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="mt-ds-4 text-body">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <ProductQuickActions product={product} />
    </div>
  );
}
