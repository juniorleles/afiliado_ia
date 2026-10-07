"use client";

import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import {
  NetworkErrorState,
  NotFoundErrorState,
  SearchErrorState,
  UnauthorizedErrorState,
  UnexpectedErrorState,
} from "@/components/ui/error-state";
import {
  NoCampaignsEmpty,
  NoOpportunitiesEmpty,
  NoProductsEmpty,
  NoReportsEmpty,
  NoSearchResultsEmpty,
} from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SectionHeader } from "@/components/ui/section-header";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ModuleSkeleton } from "@/components/ux/module-skeleton";
import { errorMessage, successMessages, warningMessage } from "@/lib/ui/feedback-messages";

export function UxPreview() {
  return (
    <ToastProvider>
      <UxPreviewBody />
    </ToastProvider>
  );
}

function UxPreviewBody() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-32">
      <header>
        <h1 className="text-h1">Pré-visualização de UX</h1>
        <p className="mt-ds-8 max-w-content text-body text-muted-foreground">
          Carregamento, listas vazias, erros, diálogos e mensagens. Nada é enviado para fora desta página.
        </p>
      </header>

      <section aria-labelledby="loading-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="loading-heading" title="Carregamento" />
        <ModuleSkeleton kind="dashboard" />
        <ModuleSkeleton kind="search" />
        <ModuleSkeleton kind="products" />
        <ModuleSkeleton kind="campaigns" />
        <ModuleSkeleton kind="reports" />
      </section>

      <section aria-labelledby="empty-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="empty-heading" title="Listas vazias" />
        <NoProductsEmpty />
        <NoCampaignsEmpty />
        <NoOpportunitiesEmpty />
        <NoReportsEmpty />
        <NoSearchResultsEmpty />
      </section>

      <section aria-labelledby="error-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="error-heading" title="Erros" />
        <NetworkErrorState onRetry={() => setNotice("Tentativa de rede registrada só nesta página.")} />
        <SearchErrorState onRetry={() => setNotice("Tentativa de pesquisa registrada só nesta página.")} />
        <UnauthorizedErrorState />
        <UnexpectedErrorState onRetry={() => setNotice("Tentativa registrada só nesta página.")} />
        <NotFoundErrorState />
        {notice ? (
          <p role="status" className="text-body text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="feedback-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="feedback-heading" title="Mensagens" />
        <Alert tone="success" title={successMessages.pesquisa} />
        <Alert tone="warning" title={warningMessage} />
        <Alert tone="danger" title={errorMessage} />
        <div className="flex flex-wrap gap-ds-8">
          <Button type="button" onClick={() => toast.push({ message: successMessages.produto, tone: "success" })}>
            Produto salvo
          </Button>
          <Button type="button" variant="secondary" onClick={() => toast.push({ message: successMessages.campanha, tone: "success" })}>
            Campanha criada
          </Button>
          <Button type="button" variant="warning" onClick={() => toast.push({ message: warningMessage, tone: "warning" })}>
            Aviso
          </Button>
          <Button type="button" variant="danger" onClick={() => toast.push({ message: errorMessage, tone: "danger" })}>
            Erro
          </Button>
        </div>
      </section>

      <section aria-labelledby="motion-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="motion-heading" title="Diálogos e movimento" />
        <Card>
          <CardContent>
            <p className="text-body">Passe o cursor neste cartão para ver a elevação.</p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-ds-8">
          <Button type="button" onClick={() => setConfirmOpen(true)}>
            Abrir confirmação
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDrawerOpen(true)}>
            Abrir painel
          </Button>
        </div>
        <Accordion type="single" collapsible>
          <AccordionItem value="exemplo">
            <AccordionTrigger>Detalhe de exemplo</AccordionTrigger>
            <AccordionContent>O painel abre e fecha com a mesma duração do restante da interface.</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Modal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirmar exemplo"
          description="Enter confirma. Esc fecha. Nada é gravado."
          primaryLabel="Confirmar"
          onPrimary={() => toast.push({ message: successMessages.configuracao, tone: "success" })}
        />
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Painel de exemplo">
          <p>O painel entra pela direita e a página continua visível.</p>
        </Drawer>
      </section>
    </div>
  );
}
