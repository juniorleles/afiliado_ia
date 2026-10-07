import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { findMarketProduct } from "@/lib/ui/market-results";

export const metadata: Metadata = { title: "Landing page preview" };

export default async function LandingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  const { produto } = await searchParams;
  const product = findMarketProduct(produto);

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12">
        <h1 className="text-h1">Pré-visualização da Landing Page</h1>
        <p className="max-w-content text-body text-muted-foreground">
          Esta pré-visualização não publica a página e não envia uma visita.
        </p>
        <Button asChild variant="secondary">
          <Link href={`/pesquisa/resultado/detalhe?produto=${product.id}`}>Voltar ao detalhe</Link>
        </Button>
      </header>
      <article lang="en" className="rounded-ds-md border border-border bg-card p-ds-24 text-foreground">
        <p className="text-caption text-muted-foreground">Landing page</p>
        <h2 className="mt-ds-12 text-h1">{product.name}</h2>
        <p className="mt-ds-8 text-body">
          <span className="text-muted-foreground">Headline. </span>
          {product.name}
        </p>
        <p className="mt-ds-8 text-body">
          <span className="text-muted-foreground">Description. </span>
          Example preview for {product.brand}. This text is not a product claim.
        </p>
        <p className="mt-ds-16 text-h2">{product.priceLabel}</p>
        <p className="mt-ds-16 text-body text-muted-foreground">The offer button stays on this preview.</p>
      </article>
    </div>
  );
}
