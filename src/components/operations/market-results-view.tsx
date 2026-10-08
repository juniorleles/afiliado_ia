"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ProductQuickActions } from "@/components/operations/product-actions";
import type { ConsoleSearchRecord } from "@/lib/console/types";

const all = "all";

export function MarketResultsView({ record, savedIds }: { record: ConsoleSearchRecord; savedIds: readonly string[] }) {
  const [brand, setBrand] = useState(all);
  const [landing, setLanding] = useState(all);
  const [sort, setSort] = useState("name");
  const brands = [...new Set(record.products.map((product) => product.brand).filter((item): item is string => Boolean(item)))];

  const visible = useMemo(() => {
    const next = record.products.filter((product) => {
      if (brand !== all && product.brand !== brand) return false;
      if (landing === "yes" && product.landingPageId === null) return false;
      if (landing === "no" && product.landingPageId !== null) return false;
      return true;
    });
    next.sort((a, b) => {
      if (sort === "price") return (a.priceLabel ?? "").localeCompare(b.priceLabel ?? "");
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [brand, landing, record.products, sort]);

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header>
        <h1 className="text-h1">Resultados do mercado</h1>
        <p className="mt-ds-8 max-w-content text-body text-muted-foreground">
          {record.keyword} · {record.country} · {record.language} · {record.device}
        </p>
      </header>
      <section aria-labelledby="summary-heading" className="grid gap-ds-12 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent><h2 id="summary-heading" className="text-caption text-muted-foreground">Patrocinados</h2><p className="text-h2">{record.sponsoredCount}</p></CardContent></Card>
        <Card><CardContent><h2 className="text-caption text-muted-foreground">Orgânicos</h2><p className="text-h2">{record.organicCount}</p></CardContent></Card>
        <Card><CardContent><h2 className="text-caption text-muted-foreground">Landing pages</h2><p className="text-h2">{record.landingPages.length}</p></CardContent></Card>
        <Card><CardContent><h2 className="text-caption text-muted-foreground">Produtos</h2><p className="text-h2">{record.products.length}</p></CardContent></Card>
      </section>
      <section aria-labelledby="health-heading">
        <Card>
          <CardContent>
            <h2 id="health-heading" className="text-h3">Leitura do mercado</h2>
            <p className="mt-ds-8 text-body">Recomendação: {record.recommendation ?? "Sem recomendação nesta busca."}</p>
            <p className="mt-ds-4 text-body text-muted-foreground">Marcas observadas: {record.brands.length === 0 ? "Nenhuma" : record.brands.join(", ")}</p>
            <p className="mt-ds-4 text-body text-muted-foreground">Preços observados: {record.prices.length === 0 ? "Nenhum" : record.prices.join(", ")}</p>
            {record.missingEvidence.length > 0 ? <p className="mt-ds-8 text-caption text-muted-foreground">Faltando: {record.missingEvidence.join(", ")}</p> : null}
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="filters-heading" className="grid gap-ds-12 sm:grid-cols-3">
        <h2 id="filters-heading" className="sr-only">Filtros</h2>
        <Select id="brand-filter" label="Marca" value={brand} onValueChange={setBrand} options={[{ value: all, label: "Todas" }, ...brands.map((item) => ({ value: item, label: item }))]} />
        <Select id="landing-filter" label="Landing page" value={landing} onValueChange={setLanding} options={[{ value: all, label: "Todas" }, { value: "yes", label: "Coletada" }, { value: "no", label: "Sem página" }]} />
        <Select id="sort-results" label="Ordem" value={sort} onValueChange={setSort} options={[{ value: "name", label: "Nome" }, { value: "price", label: "Preço" }]} />
      </section>
      {visible.length === 0 ? (
        <p className="text-body text-muted-foreground">Nenhum produto com estes filtros.</p>
      ) : (
        <div className="grid gap-ds-16 lg:grid-cols-2">
          {visible.map((product) => (
            <Card key={product.id}>
              <CardContent className="flex flex-col gap-ds-12">
                <h3 className="text-h3">{product.name}</h3>
                <p className="text-body text-muted-foreground">{product.brand ?? "Marca não observada"}</p>
                <p className="text-h2">{product.priceLabel ?? "Preço não observado"}</p>
                <p className="text-caption text-muted-foreground">{product.domain ?? "Domínio não observado"}</p>
                <ProductQuickActions searchId={record.id} productId={product.id} saved={savedIds.includes(`${record.id}-${product.id}`)} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {brand !== all || landing !== all ? (
        <Button type="button" variant="secondary" onClick={() => { setBrand(all); setLanding(all); }}>Limpar filtros</Button>
      ) : null}
    </div>
  );
}
