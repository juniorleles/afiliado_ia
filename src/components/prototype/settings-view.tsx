"use client";

import { useState } from "react";
import { PageIntro, TechnicalDetails } from "@/components/prototype/blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypeOperator } from "@/lib/prototype/mock";

const READINESS = [
  { item: "Busca de mercado", state: "Pronto" as const },
  { item: "Conta de anúncios", state: "Faltando" as const },
  { item: "Publicação da presell", state: "Pronto" as const },
];

export function SettingsView() {
  const [note, setNote] = useState("");

  return (
    <>
      <PageIntro
        title="Configurações"
        action={
          <Button type="button" onClick={() => setNote("Falta a conta de anúncios. Este protótipo não pede segredo.")}>
            Resolver o que falta
          </Button>
        }
      />
      {note ? (
        <p className="mb-4 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <Tabs defaultValue="sessao">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sessao">Sessão</TabsTrigger>
          <TabsTrigger value="prontidao">Prontidão</TabsTrigger>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="lab">Laboratório</TabsTrigger>
        </TabsList>
        <TabsContent value="sessao">
          <p className="text-sm">Operador conectado: {prototypeOperator}</p>
          <Button
            variant="secondary"
            className="mt-4"
            type="button"
            onClick={() => setNote("Neste protótipo, sair não encerra uma sessão real.")}
          >
            Sair
          </Button>
        </TabsContent>
        <TabsContent value="prontidao">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {READINESS.map((row) => (
              <li key={row.item} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{row.item}</span>
                <Badge tone={row.state === "Pronto" ? "success" : "warning"}>{row.state}</Badge>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="fontes">
          <p className="text-sm text-muted-foreground">Fontes de descoberta ficam fechadas neste protótipo. Nada é executado.</p>
        </TabsContent>
        <TabsContent value="lab">
          <p className="text-sm text-muted-foreground">Laboratório interno. Não publica página nem anúncio.</p>
        </TabsContent>
      </Tabs>
      <TechnicalDetails />
    </>
  );
}
