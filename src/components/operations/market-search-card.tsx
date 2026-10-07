"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Select } from "@/components/ui/select";
import {
  landingPageLimits,
  marketCountries,
  marketDevices,
  marketLanguages,
  recentSearches,
  searchProviders,
  searchStatusLabel,
  suggestedKeywords,
  type MarketSearchStatus,
} from "@/lib/ui/market-search";

const defaults = {
  country: "us",
  language: "en",
  device: "desktop",
  landingPages: "3",
  provider: "example",
};

function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function MarketSearchCard() {
  const keywordRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const errorId = useId();
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState(defaults.country);
  const [language, setLanguage] = useState(defaults.language);
  const [device, setDevice] = useState(defaults.device);
  const [landingPages, setLandingPages] = useState(defaults.landingPages);
  const [provider, setProvider] = useState(defaults.provider);
  const [status, setStatus] = useState<MarketSearchStatus>("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    keywordRef.current?.focus();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function focusKeyword() {
    keywordRef.current?.focus();
    keywordRef.current?.select();
  }

  function runSearch(nextKeyword: string) {
    const value = nextKeyword.trim();
    if (!value) {
      setError("Informe uma Keyword.");
      setStatus("ready");
      focusKeyword();
      return;
    }
    setError("");
    setKeyword(value);
    setStatus("searching");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    timerRef.current = window.setTimeout(() => {
      setStatus(value.toLowerCase() === "falha" ? "failed" : "completed");
    }, delay);
  }

  function clearSearch() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setKeyword("");
    setCountry(defaults.country);
    setLanguage(defaults.language);
    setDevice(defaults.device);
    setLandingPages(defaults.landingPages);
    setProvider(defaults.provider);
    setStatus("ready");
    setError("");
    focusKeyword();
  }

  function applyKeyword(value: string) {
    setKeyword(value);
    setError("");
    window.setTimeout(focusKeyword, 0);
  }

  const summary = [
    optionLabel(marketCountries, country),
    optionLabel(marketLanguages, language),
    optionLabel(marketDevices, device),
  ].join(" · ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-16">
        <div>
          <h2 id="market-search-heading" className="text-h2">
            Pesquisa de Mercado
          </h2>
          <p className="mt-ds-4 text-body text-muted-foreground">
            A busca começa aqui. Nenhum pedido sai desta página. A palavra falha mostra o estado de falha.
          </p>
        </div>

        <form
          className="flex flex-col gap-ds-12"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(keyword);
          }}
        >
          <div className="flex flex-col gap-ds-12 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="market-keyword">Keyword</Label>
              <Input
                ref={keywordRef}
                id="market-keyword"
                name="keyword"
                type="search"
                value={keyword}
                invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                aria-keyshortcuts="Control+K"
                placeholder="Keyword"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  if (error) setError("");
                }}
              />
            </div>
            <div className="flex flex-wrap gap-ds-8">
              <Button type="submit" disabled={status === "searching"}>
                Pesquisar
              </Button>
              <Button type="button" variant="secondary" onClick={clearSearch}>
                Limpar
              </Button>
            </div>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-caption text-danger">
              {error}
            </p>
          ) : null}
          <p className="text-caption text-muted-foreground">{summary}</p>
        </form>

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger>Busca avançada</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-ds-16 sm:grid-cols-2">
                <Select id="market-country" label="País" value={country} onValueChange={setCountry} options={[...marketCountries]} />
                <Select id="market-language" label="Idioma" value={language} onValueChange={setLanguage} options={[...marketLanguages]} />
                <Select id="market-device" label="Dispositivo" value={device} onValueChange={setDevice} options={[...marketDevices]} />
                <Select
                  id="market-landing-pages"
                  label="Máximo de Landing Pages"
                  value={landingPages}
                  onValueChange={setLandingPages}
                  options={[...landingPageLimits]}
                />
                <Select
                  id="market-provider"
                  label="Provedor de busca"
                  value={provider}
                  onValueChange={setProvider}
                  options={[...searchProviders]}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div>
          <Label htmlFor="market-marketplace">Marketplace</Label>
          <Input id="market-marketplace" value="Em breve" disabled readOnly />
        </div>

        <div role="status" aria-live="polite" data-search-status={status} className="flex flex-wrap items-center gap-ds-8 text-body text-foreground">
          {status === "searching" ? <LoadingSpinner label="Pesquisando" /> : <span>{searchStatusLabel[status]}</span>}
          {status !== "searching" ? (
            <span className="text-caption text-muted-foreground">
              {status === "ready" ? "Digite uma Keyword e pressione Enter." : null}
              {status === "completed" ? "Exemplo concluído. Nada foi enviado." : null}
              {status === "failed" ? "A palavra falha mostra este exemplo. Tente outra Keyword." : null}
            </span>
          ) : null}
          {status === "completed" ? (
            <Button asChild>
              <Link
                href={`/pesquisa/resultado?keyword=${encodeURIComponent(keyword)}&country=${country}&language=${language}&device=${device}`}
              >
                Ver resultados
              </Link>
            </Button>
          ) : null}
        </div>

        <div>
          <h3 className="text-h3">Buscas recentes</h3>
          <ul className="mt-ds-8 flex flex-wrap gap-ds-8">
            {recentSearches.map((term) => (
              <li key={term}>
                <Button type="button" variant="outline" onClick={() => applyKeyword(term)}>
                  {term}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-h3">Palavras sugeridas</h3>
          <ul className="mt-ds-8 flex flex-wrap gap-ds-8">
            {suggestedKeywords.map((term) => (
              <li key={term}>
                <Button type="button" variant="secondary" onClick={() => applyKeyword(term)}>
                  {term}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
