"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { WatchlistActions } from "@/components/operations/watchlist-actions";
import type { WatchItem, WatchStatus } from "@/lib/console/types";

const statusView: Record<WatchStatus, { tone: "success" | "warning" | "review" | "danger"; label: string }> = {
  pronto: { tone: "success", label: "Pronto para anunciar" },
  analise: { tone: "warning", label: "Em análise" },
  revisao: { tone: "review", label: "Aguardando revisão" },
  descartado: { tone: "danger", label: "Descartado" },
};

const priorityLabel = { high: "Alta", medium: "Média", low: "Baixa" };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function WatchlistView({ items }: { items: WatchItem[] }) {
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const visible = useMemo(
    () => items.filter((item) => (status === "all" || item.status === status) && (priority === "all" || item.priority === priority)),
    [items, priority, status],
  );
  const counts = {
    total: items.length,
    pronto: items.filter((item) => item.status === "pronto").length,
    analise: items.filter((item) => item.status === "analise").length,
    revisao: items.filter((item) => item.status === "revisao").length,
    descartado: items.filter((item) => item.status === "descartado").length,
  };

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header>
        <h1 className="text-h1">Watchlist</h1>
        <p className="mt-ds-8 max-w-content text-body text-muted-foreground">Itens para decidir o próximo passo. As notas, o estado e a prioridade ficam gravados.</p>
      </header>
      <div className="grid gap-ds-16 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex flex-col gap-ds-16">
          <section aria-labelledby="watch-filters-heading" className="grid gap-ds-12 sm:grid-cols-2">
            <h2 id="watch-filters-heading" className="sr-only">Filtros</h2>
            <Select id="watch-status" label="Estado" value={status} onValueChange={setStatus} options={[{ value: "all", label: "Todos" }, { value: "pronto", label: "Pronto para anunciar" }, { value: "analise", label: "Em análise" }, { value: "revisao", label: "Aguardando revisão" }, { value: "descartado", label: "Descartado" }]} />
            <Select id="watch-priority" label="Prioridade" value={priority} onValueChange={setPriority} options={[{ value: "all", label: "Todas" }, { value: "high", label: "Alta" }, { value: "medium", label: "Média" }, { value: "low", label: "Baixa" }]} />
          </section>
          {visible.length === 0 ? <p className="text-body text-muted-foreground">{items.length === 0 ? "A Watchlist está vazia." : "Nenhum produto com estes filtros."}</p> : null}
          {visible.map((item) => {
            const view = statusView[item.status];
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-ds-12">
                  <div className="flex flex-wrap items-start justify-between gap-ds-12">
                    <h3 className="text-h3">{item.name}</h3>
                    <Badge tone={view.tone}>{view.label}</Badge>
                  </div>
                  <p className="text-body text-muted-foreground">{item.brand ?? "Marca não observada"} · {item.priceLabel ?? "Preço não observado"}</p>
                  <dl className="grid gap-ds-8 sm:grid-cols-2">
                    <div><dt className="text-caption text-muted-foreground">Palavra-chave</dt><dd>{item.keyword}</dd></div>
                    <div><dt className="text-caption text-muted-foreground">Prioridade</dt><dd>{priorityLabel[item.priority]}</dd></div>
                    <div><dt className="text-caption text-muted-foreground">Entrada</dt><dd>{formatDate(item.addedOn)}</dd></div>
                    <div><dt className="text-caption text-muted-foreground">Domínio</dt><dd>{item.domain ?? "Não observado"}</dd></div>
                  </dl>
                  <p className="whitespace-pre-line text-body">{item.notes || "Sem nota."}</p>
                  <ol className="flex flex-col gap-ds-4">
                    {item.events.map((event) => (
                      <li key={`${event.at}-${event.label}`} className="text-caption text-muted-foreground">{formatDate(event.at)} · {event.label}</li>
                    ))}
                  </ol>
                  <WatchlistActions item={item} />
                </CardContent>
              </Card>
            );
          })}
          {status !== "all" || priority !== "all" ? <Button type="button" variant="secondary" onClick={() => { setStatus("all"); setPriority("all"); }}>Limpar filtros</Button> : null}
        </div>
        <aside aria-label="Resumo da Watchlist">
          <Card>
            <CardContent>
              <h2 className="text-h3">Fila</h2>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                <li>Na Watchlist: {counts.total}</li>
                <li>Pronto para anunciar: {counts.pronto}</li>
                <li>Em análise: {counts.analise}</li>
                <li>Aguardando revisão: {counts.revisao}</li>
                <li>Descartado: {counts.descartado}</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
