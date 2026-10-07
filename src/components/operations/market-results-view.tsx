"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ProductQuickActions } from "@/components/operations/product-actions";
import {
  marketDecisionLabel,
  marketHealth,
  marketLevelLabel,
  marketProducts,
  marketSide,
  type MarketDecision,
  type MarketLevel,
  type MarketProduct,
} from "@/lib/ui/market-results";

type Summary = {
  keyword: string;
  country: string;
  language: string;
  device: string;
  searchTime: string;
  provider: string;
  sponsored: string;
  organic: string;
  landingPages: string;
  products: string;
};

const levelOrder: Record<MarketLevel, number> = { low: 0, medium: 1, high: 2 };
const decisionOrder: Record<MarketDecision, number> = { proceed: 0, monitor: 1, skip: 2 };

const all = "all";

export function MarketResultsView({ summary }: { summary: Summary }) {
  const [competition, setCompetition] = useState(all);
  const [recommendation, setRecommendation] = useState(all);
  const [brand, setBrand] = useState(all);
  const [price, setPrice] = useState(all);
  const [country, setCountry] = useState(all);
  const [landing, setLanding] = useState(all);
  const [sort, setSort] = useState("ads");

  const brands = [...new Set(marketProducts.map((product) => product.brand))];
  const countries = [...new Set(marketProducts.map((product) => product.country))];

  const visible = useMemo(() => {
    const rows = marketProducts.filter((product) => {
      if (competition !== all && product.competition !== competition) return false;
      if (recommendation !== all && product.recommendation !== recommendation) return false;
      if (brand !== all && product.brand !== brand) return false;
      if (country !== all && product.country !== country) return false;
      if (landing === "yes" && !product.landingPage) return false;
      if (landing === "no" && product.landingPage) return false;
      if (price === "under" && product.price >= 30) return false;
      if (price === "mid" && (product.price < 30 || product.price > 60)) return false;
      if (price === "over" && product.price <= 60) return false;
      return true;
    });
    const sorted = [...rows];
    sorted.sort((left, right) => {
      if (sort === "ads") return right.observedAds - left.observedAds;
      if (sort === "recommendation") return decisionOrder[left.recommendation] - decisionOrder[right.recommendation];
      if (sort === "price") return left.price - right.price;
      if (sort === "confidence") return right.confidence - left.confidence;
      if (sort === "competition") return levelOrder[left.competition] - levelOrder[right.competition];
      return left.name.localeCompare(right.name);
    });
    return sorted;
  }, [brand, competition, country, landing, price, recommendation, sort]);

  function clearFilters() {
    setCompetition(all);
    setRecommendation(all);
    setBrand(all);
    setPrice(all);
    setCountry(all);
    setLanding(all);
  }

  const summaryRows = [
    ["Keyword", summary.keyword],
    ["País", summary.country],
    ["Idioma", summary.language],
    ["Dispositivo", summary.device],
    ["Tempo da busca", summary.searchTime],
    ["Provedor de busca", summary.provider],
    ["Resultados patrocinados", summary.sponsored],
    ["Resultados orgânicos", summary.organic],
    ["Landing Pages", summary.landingPages],
    ["Products observados", summary.products],
  ] as const;

  return (
    <div className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header>
        <h1 className="text-h1">Resultados do mercado</h1>
        <p className="mt-ds-8 max-w-content text-body text-muted-foreground">
          Leitura de exemplo para decidir o próximo passo. Nenhuma busca foi enviada.
        </p>
      </header>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-h2">
          Resumo da busca
        </h2>
        <Card className="mt-ds-16">
          <CardContent>
            <dl className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-5">
              {summaryRows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-caption text-muted-foreground">{label}</dt>
                  <dd className="mt-ds-4 text-body text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className="text-h2">
          Saúde do mercado
        </h2>
        <Card className="mt-ds-16">
          <CardContent>
            <dl className="grid gap-ds-16 sm:grid-cols-3">
              <div>
                <dt className="text-caption text-muted-foreground">Concorrência</dt>
                <dd className="mt-ds-4 text-h3">{marketHealth.competition}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Atividade</dt>
                <dd className="mt-ds-4 text-h3">{marketHealth.activity}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Recomendação</dt>
                <dd className="mt-ds-4 text-h3">{marketHealth.recommendation}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <div className="grid items-start gap-ds-24 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col gap-ds-16">
          <section aria-labelledby="filters-heading" className="flex flex-col gap-ds-16">
            <div className="flex flex-wrap items-end justify-between gap-ds-12">
              <h2 id="filters-heading" className="text-h2">
                Products
              </h2>
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
            <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
              <Select
                id="filter-competition"
                label="Concorrência"
                value={competition}
                onValueChange={setCompetition}
                options={[
                  { value: all, label: "Todas" },
                  { value: "low", label: "Baixa" },
                  { value: "medium", label: "Média" },
                  { value: "high", label: "Alta" },
                ]}
              />
              <Select
                id="filter-recommendation"
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
                id="filter-brand"
                label="Marca"
                value={brand}
                onValueChange={setBrand}
                options={[{ value: all, label: "Todas" }, ...brands.map((item) => ({ value: item, label: item }))]}
              />
              <Select
                id="filter-price"
                label="Faixa de preço"
                value={price}
                onValueChange={setPrice}
                options={[
                  { value: all, label: "Todas" },
                  { value: "under", label: "Até US$30" },
                  { value: "mid", label: "US$30–US$60" },
                  { value: "over", label: "Acima de US$60" },
                ]}
              />
              <Select
                id="filter-country"
                label="País"
                value={country}
                onValueChange={setCountry}
                options={[{ value: all, label: "Todos" }, ...countries.map((item) => ({ value: item, label: item }))]}
              />
              <Select
                id="filter-landing"
                label="Landing Page"
                value={landing}
                onValueChange={setLanding}
                options={[
                  { value: all, label: "Todas" },
                  { value: "yes", label: "Disponível" },
                  { value: "no", label: "Indisponível" },
                ]}
              />
            </div>
            <Select
              id="market-sort"
              label="Ordenar"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: "ads", label: "Ads observados" },
                { value: "recommendation", label: "Recomendação" },
                { value: "price", label: "Preço" },
                { value: "confidence", label: "Confiança" },
                { value: "competition", label: "Concorrência" },
                { value: "alpha", label: "Ordem alfabética" },
              ]}
            />
          </section>

          {visible.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhum Product com estes filtros.</p>
          ) : (
            <ul className="grid gap-ds-16 lg:grid-cols-2">
              {visible.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside aria-label="Estatísticas da busca" className="flex flex-col gap-ds-12">
          <h2 className="text-h2">Estatísticas</h2>
          <Card>
            <CardContent>
              <dl className="flex flex-col gap-ds-16">
                <div>
                  <dt className="text-caption text-muted-foreground">Marca em destaque</dt>
                  <dd className="mt-ds-4 text-body">{marketSide.topBrand}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Preço médio</dt>
                  <dd className="mt-ds-4 text-body">{marketSide.averagePrice}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Products encontrados</dt>
                  <dd className="mt-ds-4 text-body">{marketSide.productsFound}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Proporção patrocinada</dt>
                  <dd className="mt-ds-4 text-body">{marketSide.sponsoredRatio}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: MarketProduct }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-ds-12">
        <div className="flex flex-wrap items-start justify-between gap-ds-8">
          <div>
            <h3 className="text-h3">{product.name}</h3>
            <p className="mt-ds-4 text-body text-muted-foreground">{product.brand}</p>
          </div>
          <Badge status={product.badge} />
        </div>
        <p className="text-h2">{product.priceLabel}</p>
        <dl className="grid grid-cols-2 gap-ds-12">
          <div>
            <dt className="text-caption text-muted-foreground">Landing Page</dt>
            <dd className="mt-ds-4 text-body">{product.landingPage ? "Disponível" : "Indisponível"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Ads observados</dt>
            <dd className="mt-ds-4 text-body">{product.observedAds}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Concorrência</dt>
            <dd className="mt-ds-4 text-body">{marketLevelLabel[product.competition]}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Recomendação</dt>
            <dd className="mt-ds-4 text-body">{marketDecisionLabel[product.recommendation]}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Confiança</dt>
            <dd className="mt-ds-4 text-body">{product.confidence}%</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">País</dt>
            <dd className="mt-ds-4 text-body">{product.country}</dd>
          </div>
        </dl>
        <div className="mt-auto">
          <ProductQuickActions product={product} />
        </div>
      </CardContent>
    </Card>
  );
}
