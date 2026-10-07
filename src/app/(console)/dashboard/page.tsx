import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  attentionItems,
  latestOpportunities,
  nextAction,
  operationsKpis,
  quickActions,
  recentActivity,
} from "@/lib/ui/operations-center";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-24">
      <header>
        <h1 className="text-h1">Bom dia, João 👋</h1>
        <p className="mt-ds-8 text-body text-foreground">Hoje é quarta-feira.</p>
        <p className="mt-ds-4 text-body text-muted-foreground">Vamos encontrar oportunidades?</p>
        <p className="mt-ds-8 text-caption text-muted-foreground">Os números e as linhas são exemplos. Nenhuma busca foi enviada.</p>
      </header>

      <section aria-labelledby="kpis-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="kpis-heading" title="Indicadores" description="Leitura de exemplo para o dia." />
        <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-5">
          {operationsKpis.map((kpi) => (
            <MetricCard key={kpi.id} subject={kpi.label} value={kpi.value} period="Exemplo" />
          ))}
        </div>
      </section>

      <section aria-labelledby="actions-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="actions-heading" title="Ações principais" />
        <nav className="flex flex-wrap gap-ds-8">
          {quickActions.map((action) => (
            <Button key={action.href} asChild variant={action.primary ? "primary" : "secondary"}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </nav>
      </section>

      <div className="grid gap-ds-24 xl:grid-cols-2">
        <section aria-labelledby="attention-heading" className="flex flex-col gap-ds-16">
          <SectionHeader id="attention-heading" title="Atenção" />
          <Card>
            <CardContent>
              <ul className="flex flex-col gap-ds-12">
                {attentionItems.map((item) => (
                  <li key={item} className="text-body text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="activity-heading" className="flex flex-col gap-ds-16">
          <SectionHeader id="activity-heading" title="Atividade recente" />
          <Card>
            <CardContent>
              <ol className="flex flex-col gap-ds-12">
                {recentActivity.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-ds-8">
                    <span className="text-body text-foreground">{item.label}</span>
                    <span className="text-caption text-muted-foreground">{item.detail}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="next-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="next-heading" title="Próximo passo" description="Uma recomendação de exemplo." />
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-ds-16">
            <div>
              <p className="text-body text-foreground">{nextAction.title}</p>
              <p className="mt-ds-4 text-h3">{nextAction.product}</p>
            </div>
            <Button asChild>
              <Link href={nextAction.href}>{nextAction.action}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="opportunities-heading" className="flex flex-col gap-ds-16">
        <SectionHeader id="opportunities-heading" title="Oportunidades recentes" description="Lista de exemplo. Nenhuma recomendação foi calculada." />
        <Table>
          <caption className="sr-only">Oportunidades de exemplo</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Recomendação</TableHead>
              <TableHead>Concorrência</TableHead>
              <TableHead>País</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {latestOpportunities.map((row) => (
              <TableRow key={row.product}>
                <TableCell>{row.product}</TableCell>
                <TableCell>{row.recommendation}</TableCell>
                <TableCell>{row.competition}</TableCell>
                <TableCell>{row.country}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
