import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTemplate } from "@/components/layout/page-template";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExampleConfirmButton } from "@/components/ux/example-confirm-button";
import { successMessages } from "@/lib/ui/feedback-messages";
import { exampleReadiness } from "@/lib/ui/shell-examples";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <PageTemplate
      title="Configurações"
      description="Conta e prontidão de exemplo. Nenhum segredo é pedido."
      primaryAction={
        <>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Voltar ao Dashboard</Link>
          </Button>
          <ExampleConfirmButton
            label="Salvar exemplo"
            title="Salvar configuração"
            description="Nenhuma preferência é gravada. A confirmação fica nesta página."
            success={successMessages.configuracao}
          />
        </>
      }
    >
      <Tabs defaultValue="sessao">
        <TabsList aria-label="Seções de configurações">
          <TabsTrigger value="sessao">Sessão</TabsTrigger>
          <TabsTrigger value="prontidao">Prontidão</TabsTrigger>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="laboratorio">Laboratório</TabsTrigger>
        </TabsList>
        <TabsContent value="sessao">
          <p className="text-body">Operador de exemplo. A sessão não é encerrada daqui.</p>
        </TabsContent>
        <TabsContent value="prontidao">
          <ul className="flex flex-col gap-ds-12">
            {exampleReadiness.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-ds-12">
                <span className="text-body">{row.label}</span>
                <Badge status={row.status} />
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="fontes">
          <p className="text-body text-muted-foreground">Nenhuma fonte é consultada nesta página.</p>
        </TabsContent>
        <TabsContent value="laboratorio">
          <p className="text-body text-muted-foreground">O laboratório permanece fechado neste exemplo.</p>
        </TabsContent>
      </Tabs>
    </PageTemplate>
  );
}
