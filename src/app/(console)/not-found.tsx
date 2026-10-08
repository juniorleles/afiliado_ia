import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotFoundErrorState } from "@/components/ui/error-state";
import { PageTemplate } from "@/components/layout/page-template";

export default function ConsoleNotFound() {
  return (
    <PageTemplate
      title="Página não encontrada"
      description="Este endereço não faz parte do console."
      primaryAction={
        <Button asChild>
          <Link href="/dashboard">Ir para o Dashboard</Link>
        </Button>
      }
    >
      <NotFoundErrorState />
    </PageTemplate>
  );
}
