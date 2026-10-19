"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCampaignMarketResearchProgress, runCampaignMarketResearch, type MarketRunSnapshot } from "@/app/admin/[id]/research/actions";
import type { MarketResearchScreen } from "@/lib/campaign-market";
import { MarketExecutiveReport } from "@/components/campaign-wizard/market-executive-report";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = ms / 1000;
  const digits = seconds < 10 ? 1 : 0;
  return `${seconds.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
}

function ResearchResult({
  screen,
  backHref,
  strategyHref,
  onRerun,
  busy,
}: {
  screen: MarketResearchScreen;
  backHref: string;
  strategyHref: string;
  onRerun: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex scroll-mt-24 flex-col gap-ds-32" id="inteligencia-concluida">
      <h2 className="text-h2">Relatório executivo</h2>
      <MarketExecutiveReport report={screen} />
      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href={backHref}>Voltar</Link>
        </Button>
        <div className="flex flex-col gap-ds-12 sm:flex-row">
          <Button type="button" variant="secondary" disabled={busy} onClick={onRerun}>Pesquisar novamente</Button>
          <Button asChild className="h-12 px-ds-24 sm:min-w-64">
            <Link href={strategyHref}>Continuar para Estratégia</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MarketIntelligenceRun({
  campaignId,
  backHref,
  strategyHref,
  initial,
}: {
  campaignId: number;
  backHref: string;
  strategyHref: string;
  initial: MarketResearchScreen | null;
}) {
  const [screen, setScreen] = useState(initial);
  const [phase, setPhase] = useState<"idle" | "running">(initial ? "idle" : "idle");
  const [progress, setProgress] = useState<MarketRunSnapshot | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void readCampaignMarketResearchProgress(campaignId).then((next) => {
        if (!cancelled && next) setProgress(next);
      });
    }, 800);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId, running]);

  useEffect(() => {
    if (screen && !running) document.getElementById("inteligencia-concluida")?.scrollIntoView({ block: "start" });
  }, [screen, running]);

  async function start() {
    setError("");
    setProgress(null);
    setPhase("running");
    setRunning(true);
    const result = await runCampaignMarketResearch(campaignId);
    const latest = await readCampaignMarketResearchProgress(campaignId);
    if (latest) setProgress(latest);
    setRunning(false);
    setPhase("idle");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setScreen(result.screen);
  }

  if (screen && !running) {
    return (
      <>
        {error ? <Alert tone="danger" title="Pesquisa interrompida">{error}</Alert> : null}
        <ResearchResult screen={screen} backHref={backHref} strategyHref={strategyHref} onRerun={() => void start()} busy={running} />
      </>
    );
  }

  const completed = progress?.completed ?? 0;
  const planned = progress?.planned ?? 0;
  const percent = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;
  const currentQuery = progress?.query?.trim() || "Aguardando a primeira consulta";

  return (
    <>
      <Card>
        <CardContent className="grid gap-ds-16 p-ds-24 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-caption text-muted-foreground">Consulta atual</p>
            <p className="text-h3" aria-live="polite">{currentQuery}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Provider utilizado</p>
            <p className="text-h3">{progress?.provider || "Aguardando"}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Quantidade de resultados</p>
            <p className="text-h3">{progress ? String(progress.resultCount) : "0"}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Tempo</p>
            <p className="text-h3">{formatDuration(progress?.elapsedMs ?? 0)}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-caption text-muted-foreground">{planned > 0 ? `${completed} de ${planned} consultas` : "Consultas"}</p>
            <div
              className="mt-ds-8 h-2 overflow-hidden rounded-ds-full bg-secondary"
              role="progressbar"
              aria-label="Progresso da pesquisa"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>
      {error ? <Alert tone="danger" title="Pesquisa interrompida">{error}</Alert> : null}
      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href={backHref}>Voltar</Link>
        </Button>
        <Button type="button" className="h-12 px-ds-24 sm:min-w-64" disabled={phase === "running"} onClick={() => void start()}>
          {phase === "running" ? "Em andamento" : "Iniciar Inteligência de Mercado"}
        </Button>
      </div>
    </>
  );
}
