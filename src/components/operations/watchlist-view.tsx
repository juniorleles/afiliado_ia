"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { WatchlistActions } from "@/components/operations/watchlist-actions";
import { useWatchlist } from "@/components/operations/watchlist-provider";
import {
  formatWatchDate,
  marketDecisionLabel,
  marketLevelLabel,
  sortWatchlist,
  watchlistCounts,
  watchPriorityLabel,
  watchStatusView,
  type WatchlistItem,
} from "@/lib/ui/watchlist";

const all = "all";

export function WatchlistView() {
  const toast = useToast();
  const watchlist = useWatchlist();
  const [status, setStatus] = useState(all);
  const [priority, setPriority] = useState(all);
  const [country, setCountry] = useState(all);
  const [keyword, setKeyword] = useState(all);
  const [brand, setBrand] = useState(all);
  const [recommendation, setRecommendation] = useState(all);
  const [added, setAdded] = useState(all);
  const [sort, setSort] = useState("newest");

  const countries = [...new Set(watchlist.items.map((item) => item.country))];
  const keywords = [...new Set(watchlist.items.map((item) => item.keyword))];
  const brands = [...new Set(watchlist.items.map((item) => item.brand))];
  const counts = watchlistCounts(watchlist.items);

  const visible = useMemo(() => {
    const rows = watchlist.items.filter((item) => {
      if (status !== all && item.status !== status) return false;
      if (priority !== all && item.priority !== priority) return false;
      if (country !== all && item.country !== country) return false;
      if (keyword !== all && item.keyword !== keyword) return false;
      if (brand !== all && item.brand !== brand) return false;
      if (recommendation !== all && item.recommendation !== recommendation) return false;
      if (added === "today" && item.addedOn !== "2026-10-07") return false;
      if (added === "week" && item.addedOn < "2026-10-01") return false;
      if (added === "older" && item.addedOn >= "2026-10-01") return false;
      return true;
    });
    return sortWatchlist(rows, sort);
  }, [added, brand, country, keyword, priority, recommendation, sort, status, watchlist.items]);

  function clearFilters() {
    setStatus(all);
    setPriority(all);
    setCountry(all);
    setKeyword(all);
    setBrand(all);
    setRecommendation(all);
    setAdded(all);
  }

  function onQuickAdd() {
    const addedItem = watchlist.quickAdd();
    toast.push({
      message: addedItem ? `${addedItem.name} entrou na fila. Nada foi gravado.` : "Os Products de exemplo já estão na fila.",
      tone: "success",
    });
  }

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-wrap items-end justify-between gap-ds-12">
        <div>
          <h1 className="text-h1">Lista de decisão</h1>
          <p className="mt-ds-8 max-w-content text-body text-muted-foreground">
            Fila para decidir o próximo passo. Não é uma lista de favoritos. Nada é gravado.
          </p>
        </div>
        <Button type="button" onClick={onQuickAdd}>
          Adicionar Product
        </Button>
      </header>

      <div className="grid items-start gap-ds-24 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col gap-ds-16">
          <section aria-labelledby="watch-filters-heading" className="flex flex-col gap-ds-16">
            <div className="flex flex-wrap items-end justify-between gap-ds-12">
              <h2 id="watch-filters-heading" className="text-h2">
                Products
              </h2>
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
            <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
              <Select
                id="filter-watch-status"
                label="Estado"
                value={status}
                onValueChange={setStatus}
                options={[
                  { value: all, label: "Todos" },
                  { value: "pronto", label: "Pronto para anunciar" },
                  { value: "analise", label: "Em análise" },
                  { value: "revisao", label: "Aguardando revisão" },
                  { value: "descartado", label: "Descartado" },
                ]}
              />
              <Select
                id="filter-watch-priority"
                label="Prioridade"
                value={priority}
                onValueChange={setPriority}
                options={[
                  { value: all, label: "Todas" },
                  { value: "high", label: "Alta" },
                  { value: "medium", label: "Média" },
                  { value: "low", label: "Baixa" },
                ]}
              />
              <Select
                id="filter-watch-country"
                label="País"
                value={country}
                onValueChange={setCountry}
                options={[{ value: all, label: "Todos" }, ...countries.map((item) => ({ value: item, label: item }))]}
              />
              <Select
                id="filter-watch-keyword"
                label="Keyword"
                value={keyword}
                onValueChange={setKeyword}
                options={[{ value: all, label: "Todas" }, ...keywords.map((item) => ({ value: item, label: item }))]}
              />
              <Select
                id="filter-watch-brand"
                label="Marca"
                value={brand}
                onValueChange={setBrand}
                options={[{ value: all, label: "Todas" }, ...brands.map((item) => ({ value: item, label: item }))]}
              />
              <Select
                id="filter-watch-recommendation"
                label="Recomendação"
                value={recommendation}
                onValueChange={setRecommendation}
                options={[
                  { value: all, label: "Todas" },
                  { value: "proceed", label: "Seguir" },
                  { value: "monitor", label: "Monitorar" },
                  { value: "skip", label: "Evitar" },
                ]}
              />
              <Select
                id="filter-watch-date"
                label="Data de entrada"
                value={added}
                onValueChange={setAdded}
                options={[
                  { value: all, label: "Todas" },
                  { value: "today", label: "Hoje" },
                  { value: "week", label: "Últimos 7 dias" },
                  { value: "older", label: "Anteriores" },
                ]}
              />
            </div>
            <Select
              id="watch-sort"
              label="Ordenar"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: "newest", label: "Mais recentes" },
                { value: "oldest", label: "Mais antigos" },
                { value: "priority", label: "Prioridade" },
                { value: "recommendation", label: "Recomendação" },
                { value: "competition", label: "Concorrência" },
                { value: "confidence", label: "Confiança" },
              ]}
            />
          </section>

          {watchlist.items.length === 0 ? (
            <p className="text-body text-muted-foreground">A fila está vazia.</p>
          ) : visible.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhum Product com estes filtros.</p>
          ) : (
            <ul className="grid gap-ds-16 lg:grid-cols-2">
              {visible.map((item) => (
                <li key={item.id}>
                  <WatchCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside aria-label="Resumo da fila" className="flex flex-col gap-ds-12">
          <h2 className="text-h2">Fila</h2>
          <Card>
            <CardContent>
              <dl className="flex flex-col gap-ds-16">
                <QueueStat label="Na fila" value={counts.total} />
                <QueueStat label="Pronto para anunciar" value={counts.pronto} />
                <QueueStat label="Em análise" value={counts.analise} />
                <QueueStat label="Aguardando revisão" value={counts.revisao} />
                <QueueStat label="Descartado" value={counts.descartado} />
              </dl>
              <p className="mt-ds-16 text-caption text-muted-foreground">Contagem desta fila de exemplo.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-ds-4 text-body">{value}</dd>
    </div>
  );
}

function WatchCard({ item }: { item: WatchlistItem }) {
  const status = watchStatusView[item.status];
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-ds-12">
        <div className="flex flex-wrap items-start justify-between gap-ds-8">
          <div>
            <h3 className="text-h3">{item.name}</h3>
            <p className="mt-ds-4 text-body text-muted-foreground">{item.brand}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-h2">{item.priceLabel}</p>
        <dl className="grid grid-cols-2 gap-ds-12">
          <Fact label="Keyword" value={item.keyword} />
          <Fact label="País" value={item.country} />
          <Fact label="Concorrência" value={marketLevelLabel[item.competition]} />
          <Fact label="Recomendação" value={marketDecisionLabel[item.recommendation]} />
          <Fact label="Confiança" value={`${item.confidence}%`} />
          <Fact label="Entrada" value={formatWatchDate(item.addedOn)} />
          <Fact label="Prioridade" value={watchPriorityLabel[item.priority]} />
        </dl>
        <div className="flex flex-wrap gap-ds-8">
          {item.tags.length === 0 ? (
            <p className="text-caption text-muted-foreground">Sem etiqueta.</p>
          ) : (
            item.tags.map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))
          )}
        </div>
        <p className="whitespace-pre-line text-body text-foreground">{item.notes || "Sem nota."}</p>
        <div className="mt-auto">
          <WatchlistActions item={item} />
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-ds-4 text-body">{value}</dd>
    </div>
  );
}

export function WatchlistProductPreview({ productId }: { productId?: string }) {
  const watchlist = useWatchlist();
  const item = watchlist.find(productId);
  const queued = watchlist.has(item.id);
  const status = watchStatusView[item.status];
  const facts = [
    ["Marca", item.brand],
    ["Preço", item.priceLabel],
    ["Keyword", item.keyword],
    ["País", item.country],
    ["Concorrência", marketLevelLabel[item.competition]],
    ["Recomendação", marketDecisionLabel[item.recommendation]],
    ["Confiança", `${item.confidence}%`],
    ["Entrada", formatWatchDate(item.addedOn)],
    ["Prioridade", watchPriorityLabel[item.priority]],
    ["Etiquetas", item.tags.join(", ") || "Sem etiqueta"],
  ] as const;

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12">
        <p className="text-caption text-muted-foreground">
          {queued ? "Product da fila de decisão. Nenhum dado foi observado nesta página." : "Este Product não está na fila de exemplo."}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-ds-12">
          <h1 className="text-h1">{item.name}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </header>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-16 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <Fact key={label} label={label} value={value} />
            ))}
          </dl>
          <p className="mt-ds-16 whitespace-pre-line text-body">{item.notes || "Sem nota."}</p>
        </CardContent>
      </Card>
      <WatchlistActions item={item} />
    </div>
  );
}

export function WatchlistLandingPreview({ productId }: { productId?: string }) {
  const item = useWatchlist().find(productId);
  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12">
        <h1 className="text-h1">Pré-visualização da Landing Page</h1>
        <p className="max-w-content text-body text-muted-foreground">Esta pré-visualização não publica a página e não envia uma visita.</p>
        <Button asChild variant="secondary">
          <Link href={`/lista/produto?produto=${item.id}`}>Voltar ao Product</Link>
        </Button>
      </header>
      <article lang="en" className="rounded-ds-md border border-border bg-card p-ds-24 text-foreground">
        <p className="text-caption text-muted-foreground">Landing page</p>
        <h2 className="mt-ds-12 text-h1">{item.name}</h2>
        <p className="mt-ds-8 text-body">
          <span className="text-muted-foreground">Headline. </span>
          {item.name}
        </p>
        <p className="mt-ds-8 text-body">
          <span className="text-muted-foreground">Description. </span>
          Example preview for {item.brand}. This text is not a product claim.
        </p>
        <p className="mt-ds-16 text-h2">{item.priceLabel}</p>
        <p className="mt-ds-16 text-body text-muted-foreground">The offer button stays on this preview.</p>
      </article>
    </div>
  );
}

export function CampaignDraftPreview({ productId }: { productId?: string }) {
  const item = useWatchlist().find(productId);
  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header className="flex flex-col gap-ds-12">
        <h1 className="text-h1">Rascunho de campanha</h1>
        <p className="max-w-content text-body text-muted-foreground">Nenhum anúncio é enviado.</p>
        <Button asChild variant="secondary">
          <Link href={`/lista/produto?produto=${item.id}`}>Voltar ao Product</Link>
        </Button>
      </header>
      <Card>
        <CardContent>
          <dl className="grid gap-ds-16 sm:grid-cols-2">
            <Fact label="Product" value={item.name} />
            <Fact label="Keyword" value={item.keyword} />
            <Fact label="Headline" value={item.name} />
            <Fact label="País" value={item.country} />
          </dl>
          <p className="mt-ds-16 text-body">
            <span className="text-muted-foreground">Description. </span>
            Example draft for {item.brand}. This text is not a product claim.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
