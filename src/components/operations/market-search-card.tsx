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
import { runMarketSearch } from "@/app/(console)/actions";
import {
  landingPageLimits,
  marketCountries,
  marketDevices,
  marketLanguages,
  searchProviders,
  searchStatusLabel,
  type MarketSearchStatus,
} from "@/lib/ui/market-search";

const defaults = {
  country: "us",
  language: "en",
  device: "desktop",
  landingPages: "3",
  provider: "searchapi",
};

function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function MarketSearchCard({ recentSearches }: { recentSearches: readonly { id: string; keyword: string }[] }) {
  const keywordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState(defaults.country);
  const [language, setLanguage] = useState(defaults.language);
  const [device, setDevice] = useState(defaults.device);
  const [landingPages, setLandingPages] = useState(defaults.landingPages);
  const [provider, setProvider] = useState(defaults.provider);
  const [status, setStatus] = useState<MarketSearchStatus>("ready");
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState("");

  useEffect(() => {
    keywordRef.current?.focus();
  }, []);

  function focusKeyword() {
    keywordRef.current?.focus();
    keywordRef.current?.select();
  }

  async function runSearch(nextKeyword: string) {
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
    try {
      const result = await runMarketSearch({
        keyword: value,
        country,
        language,
        device,
        maxPages: Number(landingPages),
      });
      setResultId(result.id);
      if (result.status === "REJECTED") {
        setStatus("failed");
        setError(result.message);
        return;
      }
      setStatus("completed");
    } catch {
      setStatus("failed");
      setError("A busca não pôde ser concluída.");
    }
  }

  function clearSearch() {
    setKeyword("");
    setCountry(defaults.country);
    setLanguage(defaults.language);
    setDevice(defaults.device);
    setLandingPages(defaults.landingPages);
    setProvider(defaults.provider);
    setStatus("ready");
    setError("");
    setResultId("");
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
            A busca usa SearchApi. Landing Pages e Products observados aparecem nos resultados.
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
              {status === "completed" ? "Pesquisa concluída." : null}
              {status === "failed" ? error : null}
            </span>
          ) : null}
          {status === "completed" ? (
            <Button asChild>
              <Link
                href={`/pesquisa/resultado?busca=${encodeURIComponent(resultId)}`}
              >
                Ver resultados
              </Link>
            </Button>
          ) : null}
        </div>

        <div>
          <h3 className="text-h3">Buscas recentes</h3>
          {recentSearches.length === 0 ? (
            <p className="mt-ds-8 text-body text-muted-foreground">Ainda não há uma busca gravada.</p>
          ) : (
            <ul className="mt-ds-8 flex flex-wrap gap-ds-8">
              {recentSearches.map((term) => (
                <li key={term.id}>
                  <Button type="button" variant="outline" onClick={() => applyKeyword(term.keyword)}>
                    {term.keyword}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
