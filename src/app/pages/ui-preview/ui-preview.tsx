"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, themeNames, type ThemeName } from "@/lib/ui/theme";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge, badgeStatuses, type BadgeStatus } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardActions, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import {
  NoCampaignsEmpty,
  NoOpportunitiesEmpty,
  NoProductsEmpty,
  NoReportsEmpty,
  NoSearchResultsEmpty,
} from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { UiIcon, uiIconLabels, type UiIconName } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { InfoCard, KpiCard, MetricCard, StatCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { RadioGroup } from "@/components/ui/radio-group";
import { SearchInput } from "@/components/ui/search-input";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

const buttonVariants = ["primary", "secondary", "outline", "ghost", "danger", "success", "warning", "link"] as const;

const sampleRows: { id: string; name: string; status: BadgeStatus }[] = [
  { id: "north-offer", name: "North Offer", status: "pronto" },
  { id: "plain-offer", name: "Plain Offer", status: "atencao" },
  { id: "zebra-offer", name: "Zebra Offer", status: "em-analise" },
  { id: "paused-test-draft", name: "Paused Test Draft", status: "revisar" },
];

const iconNames = Object.keys(uiIconLabels) as UiIconName[];

export function UiPreview() {
  return (
    <ToastProvider>
      <PreviewBody />
    </ToastProvider>
  );
}

function PreviewBody() {
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeName>("light");
  const [country, setCountry] = useState("us");
  const [period, setPeriod] = useState("7");
  const [drafts, setDrafts] = useState(true);
  const [periodsOn, setPeriodsOn] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rowName, setRowName] = useState("");

  useEffect(() => {
    applyTheme(theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
  }, [theme]);

  return (
    <main className="ds-container ds-section flex flex-col gap-ds-48">
      <PageHeader
        title="Biblioteca de componentes"
        description="Pré-visualização de desenvolvimento. Esta página não entra no menu."
        breadcrumb={[{ label: "Início", href: "/" }, { label: "UI Preview" }]}
        actions={
          <div className="flex flex-wrap gap-ds-8" role="group" aria-label="Tema">
            {themeNames.map((name) => (
              <Button key={name} type="button" variant={theme === name ? "primary" : "secondary"} onClick={() => setTheme(name)}>
                {name === "light" ? "Claro" : name === "dark" ? "Escuro" : "Sistema"}
              </Button>
            ))}
          </div>
        }
      />

      <section className="flex flex-col gap-ds-16" aria-labelledby="buttons-heading">
        <SectionHeader id="buttons-heading" title="Button" description="Variantes, estado desabilitado e IconButton." />
        <div className="flex flex-wrap gap-ds-8">
          {buttonVariants.map((variant) => (
            <Button key={variant} type="button" variant={variant}>
              {variant}
            </Button>
          ))}
          <Button type="button" variant="icon" size="icon" aria-label="Fechar exemplo">
            <X aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
          </Button>
          <IconButton label="Fechar">
            <X aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
          </IconButton>
          <Button type="button" disabled>
            Desabilitado
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="badges-heading">
        <SectionHeader id="badges-heading" title="Badge" />
        <div className="flex flex-wrap gap-ds-8">
          {(Object.keys(badgeStatuses) as BadgeStatus[]).map((status) => (
            <Badge key={status} status={status} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="fields-heading">
        <SectionHeader id="fields-heading" title="Campos" description="Input, SearchInput, Textarea, Label, Select, Checkbox, Switch e RadioGroup." />
        <div className="grid gap-ds-24 md:grid-cols-2">
        <div className="flex flex-col gap-ds-16">
          <div>
            <Label htmlFor="preview-name">Nome</Label>
            <Input id="preview-name" defaultValue="North Offer" />
          </div>
          <div>
            <Label htmlFor="preview-invalid">Campo com erro</Label>
            <Input id="preview-invalid" invalid defaultValue="" aria-describedby="preview-invalid-error" />
            <p id="preview-invalid-error" role="alert" className="mt-ds-4 text-caption text-danger">
              Informe um nome.
            </p>
          </div>
          <SearchInput shortcut="Atalho mostrado: Ctrl K" placeholder="Nome da campanha" />
          <div>
            <Label htmlFor="preview-notes">Notas</Label>
            <Textarea id="preview-notes" defaultValue="Nota de apresentação." />
          </div>
        </div>
        <div className="flex flex-col gap-ds-16">
          <Select
            label="País"
            value={country}
            onValueChange={setCountry}
            options={[
              { value: "us", label: "Estados Unidos" },
              { value: "br", label: "Brasil" },
            ]}
          />
          <Checkbox label="Incluir rascunhos" checked={drafts} onChange={(event) => setDrafts(event.target.checked)} />
          <Switch label="Mostrar períodos" checked={periodsOn} onCheckedChange={setPeriodsOn} />
          <RadioGroup
            legend="Período"
            name="preview-period"
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "1", label: "Hoje" },
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
            ]}
          />
        </div>
        </div>
      </section>

      <section className="flex flex-col gap-ds-12" aria-labelledby="alerts-heading">
        <SectionHeader id="alerts-heading" title="Alert" />
        <Alert tone="info" title="Em análise">
          A leitura desta lista ainda está em andamento.
        </Alert>
        <Alert tone="success" title="Pronto">
          A lista pode ser aberta.
        </Alert>
        <Alert tone="warning" title="Atenção">
          Falta um dado observado.
        </Alert>
        <Alert tone="danger" title="Bloqueado">
          Esta ação permanece indisponível.
        </Alert>
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="cards-heading">
        <SectionHeader id="cards-heading" title="Card" description="Título, descrição, ações, rodapé, status e métricas." />
        <div className="grid gap-ds-24 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-h3 text-foreground">North Offer</CardTitle>
              <Badge status="pronto" />
            </CardHeader>
            <CardContent>
              <CardDescription>Cartão de apresentação com descrição curta.</CardDescription>
              <CardActions className="mt-ds-16">
                <Button type="button">Abrir</Button>
                <Button type="button" variant="secondary">
                  Voltar
                </Button>
              </CardActions>
            </CardContent>
            <CardFooter>
              <span className="text-caption text-muted-foreground">Rodapé</span>
            </CardFooter>
          </Card>
          <MetricCard subject="Visitas" value="128" period="Período de exemplo" />
          <KpiCard label="Cliques no botão" value="14" hint="Número de exemplo" status="atencao" />
          <StatCard label="Compras" value="2" />
        </div>
        <InfoCard
          title="InfoCard"
          description="Um bloco informativo com status e rodapé."
          status="em-analise"
          footer={<span className="text-caption text-muted-foreground">Sem ação de negócio</span>}
        />
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="table-heading">
        <SectionHeader id="table-heading" title="Table" description="Ordenação, paginação, seleção e linha ativável." />
        <p aria-live="polite" className="text-caption text-muted-foreground">
          {rowName ? `Linha ativada: ${rowName}` : "Nenhuma linha ativada."}
        </p>
        <DataTable
          caption="Offers de exemplo"
          rows={sampleRows}
          pageSize={2}
          selectable
          getRowId={(row) => row.id}
          onRowActivate={(row) => setRowName(row.name)}
          columns={[
            { id: "name", header: "Nome", sortValue: (row) => row.name, cell: (row) => row.name },
            {
              id: "status",
              header: "Estado",
              sortValue: (row) => badgeStatuses[row.status].label,
              cell: (row) => <Badge status={row.status} />,
            },
          ]}
        />
        <SectionHeader title="Loading" />
        <DataTable<{ id: string }>
          caption="Tabela carregando"
          rows={[]}
          loading
          getRowId={(row) => row.id}
          columns={[{ id: "name", header: "Nome", cell: () => null }]}
        />
        <SectionHeader title="Empty" />
        <DataTable<{ id: string }>
          caption="Tabela vazia"
          rows={[]}
          empty={<NoSearchResultsEmpty />}
          getRowId={(row) => row.id}
          columns={[{ id: "name", header: "Nome", cell: () => null }]}
        />
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="tabs-heading">
        <SectionHeader id="tabs-heading" title="Tabs e Accordion" />
        <Tabs defaultValue="desempenho">
          <TabsList aria-label="Exemplo de abas">
            <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            <TabsTrigger value="transacoes">Transações</TabsTrigger>
            <TabsTrigger value="otimizacao">Otimização</TabsTrigger>
          </TabsList>
          <TabsContent value="desempenho">Conteúdo de Desempenho.</TabsContent>
          <TabsContent value="transacoes">Conteúdo de Transações.</TabsContent>
          <TabsContent value="otimizacao">Conteúdo de Otimização.</TabsContent>
        </Tabs>
        <Accordion type="single" collapsible>
          <AccordionItem value="technical">
            <AccordionTrigger>Ver detalhes técnicos</AccordionTrigger>
            <AccordionContent>O detalhe técnico fica fechado até ser aberto.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="overlays-heading">
        <SectionHeader id="overlays-heading" title="Modal, Drawer, Tooltip e Toast" />
        <div className="flex flex-wrap gap-ds-8">
          <Button type="button" onClick={() => setModalOpen(true)}>
            Abrir modal
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDrawerOpen(true)}>
            Abrir drawer
          </Button>
          <Tooltip content="Cliques no botão conta o clique no botão da página.">
            <Button type="button" variant="outline">
              Termo com tooltip
            </Button>
          </Tooltip>
          <Button type="button" variant="secondary" onClick={() => toast.push({ message: "Revisão concluída." })}>
            Toast
          </Button>
          <Button type="button" variant="danger" onClick={() => toast.push({ message: "A busca não terminou.", tone: "danger" })}>
            Toast de erro
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Confirmar"
          description="Esta confirmação só fecha o exemplo. Nada é publicado."
          primaryLabel="Confirmar"
        />
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Detalhe">
          <p>O restante da página continua visível atrás deste painel.</p>
        </Drawer>
      </section>

      <Separator />

      <section className="flex flex-col gap-ds-16" aria-labelledby="feedback-heading">
        <SectionHeader id="feedback-heading" title="Loading, Skeleton, Empty e Error" />
        <LoadingSpinner />
        <Skeleton className="h-ds-16 w-ds-80" />
        <div className="grid gap-ds-16">
          <NoProductsEmpty />
          <NoCampaignsEmpty />
          <NoReportsEmpty />
          <NoOpportunitiesEmpty />
          <NoSearchResultsEmpty />
        </div>
        <ErrorState message="O exemplo de erro permanece nesta página." onRetry={() => toast.push({ message: "Tentativa registrada só na pré-visualização." })} />
      </section>

      <section className="flex flex-col gap-ds-16" aria-labelledby="icons-heading">
        <SectionHeader id="icons-heading" title="Ícones" description="Cada ícone aparece com o nome da área." />
        <ul className="grid gap-ds-12 sm:grid-cols-2 lg:grid-cols-3">
          {iconNames.map((name) => (
            <li key={name} className="flex items-center gap-ds-8 text-body">
              <UiIcon name={name} size={20} />
              <span>{uiIconLabels[name]}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
