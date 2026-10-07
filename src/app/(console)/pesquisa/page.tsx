import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExampleSearchForm } from "@/components/layout/example-search-form";
import { PageTemplate } from "@/components/layout/page-template";

export const metadata: Metadata = { title: "Pesquisa de Mercado" };

export default function PesquisaPage() {
  return (
    <PageTemplate
      title="Pesquisa de Mercado"
      description="Formulário de exemplo. Nenhuma busca é enviada."
      primaryAction={
        <Button asChild variant="secondary">
          <Link href="/produtos">Ver Products</Link>
        </Button>
      }
    >
      <ExampleSearchForm />
    </PageTemplate>
  );
}
