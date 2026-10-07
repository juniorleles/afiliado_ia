import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTemplate } from "@/components/layout/page-template";
import { exampleOffers } from "@/lib/ui/shell-examples";

export const metadata: Metadata = { title: "Oportunidades" };

export default function OportunidadesPage() {
  return (
    <PageTemplate
      title="Oportunidades"
      description="Ordem de exemplo. Nenhuma recomendação foi calculada."
      primaryAction={
        <Button asChild>
          <Link href="/produtos">Ver Products</Link>
        </Button>
      }
    >
      <ol className="flex flex-col gap-ds-12">
        {exampleOffers.map((offer, index) => (
          <li key={offer.name} className="flex flex-wrap items-center justify-between gap-ds-12 rounded-ds-md border border-border bg-card p-ds-16 transition-[box-shadow] duration-ds-fast ease-ds-standard hover:shadow-ds-1">
            <span className="text-body">
              {index + 1}. {offer.name}
            </span>
            <Badge status={offer.status} />
          </li>
        ))}
      </ol>
    </PageTemplate>
  );
}
