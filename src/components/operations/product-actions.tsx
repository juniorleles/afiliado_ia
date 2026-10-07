"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useWatchlist } from "@/components/operations/watchlist-provider";
import type { MarketProduct } from "@/lib/ui/market-results";

export function ProductQuickActions({ product }: { product: MarketProduct }) {
  const toast = useToast();
  const watchlist = useWatchlist();
  const saved = watchlist.has(product.id);
  const detailHref = `/pesquisa/resultado/detalhe?produto=${product.id}`;
  const landingHref = `/pesquisa/resultado/landing-page?produto=${product.id}`;

  return (
    <div className="flex flex-wrap gap-ds-8">
      <Button asChild>
        <Link href={landingHref}>Abrir Landing Page</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={detailHref}>Ver detalhes</Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => toast.push({ message: "Rascunho de exemplo. Nenhum anúncio é enviado.", tone: "success" })}
      >
        Gerar rascunho
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const result = watchlist.add(product.id);
          toast.push({
            message: result === "added" ? "Lista de exemplo atualizada. Nada foi gravado." : "Este Product já está na fila.",
            tone: "success",
          });
        }}
      >
        {saved ? "Na lista de exemplo" : "Salvar na lista"}
      </Button>
    </div>
  );
}
