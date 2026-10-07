"use client";

import { PageIntro, TechnicalDetails } from "@/components/prototype/blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypeCampaign, prototypeProduct, prototypeReports } from "@/lib/prototype/mock";
import { useState } from "react";

export function ReportsView() {
  const [reviewed, setReviewed] = useState(false);

  return (
    <>
      <PageIntro title="Monitoramento" lede={prototypeCampaign.name} />
      <Tabs defaultValue="desempenho">
        <TabsList className="flex-wrap">
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="transacoes">Transações</TabsTrigger>
          <TabsTrigger value="otimizacao">Otimização</TabsTrigger>
        </TabsList>
        <TabsContent value="desempenho">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent>
                <CardTitle>Visitas</CardTitle>
                <p className="mt-2 text-[28px] font-semibold tabular-nums">{prototypeReports.visits}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <CardTitle>Cliques no botão</CardTitle>
                <p className="mt-2 text-[28px] font-semibold tabular-nums">{prototypeReports.buttonClicks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <CardTitle>Compras</CardTitle>
                <p className="mt-2 text-[28px] font-semibold tabular-nums">{prototypeReports.purchases}</p>
              </CardContent>
            </Card>
          </div>
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Gráfico do período</p>
            <div className="mt-4 flex h-32 items-end gap-6">
              <Bar label="Visitas" height="80%" />
              <Bar label="Cliques" height="36%" />
              <Bar label="Compras" height="16%" />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="transacoes">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Hoje</TableCell>
                <TableCell>{prototypeCampaign.name}</TableCell>
                <TableCell>{prototypeProduct.price}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="otimizacao">
          <Card>
            <CardContent>
              <CardTitle>Recomendação</CardTitle>
              <p className="mt-2 text-lg font-semibold">{prototypeProduct.recommendation}</p>
              <p className="mt-2 text-sm text-muted-foreground">Ainda não há conversão suficiente para outra ação.</p>
            </CardContent>
          </Card>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Revisar desempenho</TableCell>
                <TableCell>
                  <Badge tone="warning">{reviewed ? "Revisada, não executada" : "Ainda não executada"}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Button className="mt-4" type="button" onClick={() => setReviewed(true)}>
            Revisar ação pendente
          </Button>
          {reviewed ? (
            <p className="mt-3 text-sm" role="status">
              A ação continua pendente. Nada foi executado.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
      <TechnicalDetails />
    </>
  );
}

function Bar({ label, height }: { label: string; height: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="w-full max-w-[72px] rounded-sm bg-primary" style={{ height }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
