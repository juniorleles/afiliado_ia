"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Braces,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Eye,
  FileText,
  Images,
  LayoutTemplate,
  Loader2,
  Megaphone,
  MousePointerClick,
  PanelTop,
  Search,
  ShieldCheck,
  Star,
  Target,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  loadMarketIntelligenceForGeneration,
  loadProductFactsForGeneration,
  loadStrategyForGeneration,
} from "@/app/admin/[id]/gerando/actions";
import { runCampaignLandingGeneration } from "@/app/admin/[id]/estrategia/actions";
import {
  LANDING_GENERATION_STEPS,
  type LandingGenerationStatus,
  type LandingGenerationStepId,
} from "@/lib/landing-generation-steps";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ICONS: Record<LandingGenerationStepId, LucideIcon> = {
  facts: FileText,
  intelligence: Search,
  strategy: Target,
  structure: LayoutTemplate,
  headlines: Type,
  hero: PanelTop,
  benefits: Star,
  faq: CircleHelp,
  cta: MousePointerClick,
  seo: Search,
  schema: Braces,
  assets: Images,
  ads: Megaphone,
  validation: ShieldCheck,
  preview: Eye,
  ready: CircleCheck,
};

const STATUS_LABEL: Record<LandingGenerationStatus, string> = {
  waiting: "Aguardando",
  running: "Executando",
  completed: "Concluído",
  error: "Erro",
};

const MESSAGES: Record<LandingGenerationStepId, string> = {
  facts: "Carregando os fatos do produto...",
  intelligence: "Analisando concorrentes...",
  strategy: "Aplicando a estratégia...",
  structure: "Montando a estrutura...",
  headlines: "Criando Headlines...",
  hero: "Escrevendo Hero...",
  benefits: "Escrevendo os benefícios...",
  faq: "Montando FAQ...",
  cta: "Criando o botão...",
  seo: "Gerando SEO...",
  schema: "Gerando o schema...",
  assets: "Preparando Assets...",
  ads: "Preparando o Google Ads...",
  validation: "Executando validação...",
  preview: "Criando a prévia...",
  ready: "Finalizando Landing...",
};

const SUCCESS_MESSAGE = "Landing criada com sucesso.";
const STEP_MS = 700;

const GENERATION_STEPS: LandingGenerationStepId[] = [
  "structure",
  "headlines",
  "hero",
  "benefits",
  "faq",
  "cta",
  "seo",
  "schema",
  "assets",
  "ads",
  "validation",
  "preview",
  "ready",
];

function blankProgress(): Record<LandingGenerationStepId, LandingGenerationStatus> {
  return Object.fromEntries(LANDING_GENERATION_STEPS.map((step) => [step.id, "waiting"])) as Record<LandingGenerationStepId, LandingGenerationStatus>;
}

function stepDuration(): number {
  if (typeof window === "undefined") return STEP_MS;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 160 : STEP_MS;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function LandingGenerationRun({
  campaignId,
  backHref,
}: {
  campaignId: number;
  backHref: string;
}) {
  const [progress, setProgress] = useState(blankProgress);
  const [error, setError] = useState("");
  const [errorStep, setErrorStep] = useState<LandingGenerationStepId | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [landingId, setLandingId] = useState<number | null>(null);
  const [message, setMessage] = useState(MESSAGES.facts);

  useEffect(() => {
    let cancelled = false;
    const setStep = (id: LandingGenerationStepId, status: LandingGenerationStatus) => {
      if (cancelled) return;
      setProgress((current) => ({ ...current, [id]: status }));
    };
    const setMany = (ids: LandingGenerationStepId[], status: LandingGenerationStatus) => {
      if (cancelled) return;
      setProgress((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = status;
        return next;
      });
    };
    const show = (id: LandingGenerationStepId) => {
      if (cancelled) return;
      setMessage(MESSAGES[id]);
    };

    let active: LandingGenerationStepId = "facts";

    async function hold(id: LandingGenerationStepId, started: number) {
      const remaining = stepDuration() - (performance.now() - started);
      if (remaining > 0) await pause(remaining);
      if (cancelled) return;
      setStep(id, "completed");
    }

    async function execute() {
      setError("");
      setErrorStep(null);
      setLandingId(null);
      setProgress(blankProgress());
      show("facts");

      active = "facts";
      setStep("facts", "running");
      const factsStarted = performance.now();
      const facts = await loadProductFactsForGeneration(campaignId);
      if (cancelled) return;
      if (!facts.ok) {
        setStep("facts", "error");
        setErrorStep("facts");
        setError(facts.message);
        setMessage(facts.message);
        return;
      }
      await hold("facts", factsStarted);
      if (cancelled) return;

      active = "intelligence";
      show("intelligence");
      setStep("intelligence", "running");
      const intelligenceStarted = performance.now();
      await loadMarketIntelligenceForGeneration(campaignId);
      if (cancelled) return;
      await hold("intelligence", intelligenceStarted);
      if (cancelled) return;

      active = "strategy";
      show("strategy");
      setStep("strategy", "running");
      const strategyStarted = performance.now();
      await loadStrategyForGeneration(campaignId);
      if (cancelled) return;
      await hold("strategy", strategyStarted);
      if (cancelled) return;

      active = "structure";
      let settled = false;
      let generated: Awaited<ReturnType<typeof runCampaignLandingGeneration>> | undefined;
      let failure: unknown;
      const pending = runCampaignLandingGeneration(campaignId).then(
        (value) => {
          generated = value;
          settled = true;
        },
        (err: unknown) => {
          failure = err;
          settled = true;
        },
      );
      for (const id of GENERATION_STEPS) {
        if (cancelled || settled) break;
        active = id;
        show(id);
        setStep(id, "running");
        await pause(stepDuration());
        if (cancelled || settled) break;
        if (id !== "ready") setStep(id, "completed");
      }
      await pending;
      if (cancelled) return;
      if (failure) throw failure;
      const result = generated;
      if (!result) return;
      if (!result.ok) {
        const produced: LandingGenerationStepId[] = ["facts", "intelligence", "strategy", "structure", "headlines", "hero", "benefits", "faq", "cta"];
        const failed: LandingGenerationStepId = result.code === "bloqueada" ? "validation" : result.code === "publicada" ? "facts" : "structure";
        const failedIndex = LANDING_GENERATION_STEPS.findIndex((step) => step.id === failed);
        setProgress(() => {
          const next = blankProgress();
          LANDING_GENERATION_STEPS.forEach((step, index) => {
            if (step.id === failed) next[step.id] = "error";
            else if (result.code === "bloqueada") next[step.id] = produced.includes(step.id) ? "completed" : "waiting";
            else if (index < failedIndex) next[step.id] = "completed";
          });
          return next;
        });
        setErrorStep(failed);
        setError(result.message);
        setMessage(result.message);
        return;
      }

      setMany(LANDING_GENERATION_STEPS.map((step) => step.id), "completed");
      setMessage(SUCCESS_MESSAGE);
      setLandingId(result.landingId);
    }

    execute().catch((err: unknown) => {
      if (cancelled) return;
      const text = err instanceof Error && err.message.trim() ? err.message : "A landing page não foi gerada. Nada foi salvo.";
      setProgress((current) => ({ ...current, [active]: "error" }));
      setErrorStep(active);
      setError(text);
      setMessage(text);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, campaignId]);

  const total = LANDING_GENERATION_STEPS.length;
  const completed = LANDING_GENERATION_STEPS.filter((step) => progress[step.id] === "completed").length;
  const running = LANDING_GENERATION_STEPS.some((step) => progress[step.id] === "running");
  const currentStep = landingId ? total : Math.min(total, completed + (running ? 1 : 0));
  const percent = landingId ? 100 : Math.round(((completed + (running ? 0.45 : 0)) / total) * 100);
  const remainingSteps = Math.max(0, total - completed - (running ? 0.4 : 0));
  const remainingSeconds = landingId ? 0 : Math.max(1, Math.ceil((remainingSteps * stepDuration()) / 1000));

  return (
    <div className="flex flex-col gap-ds-32">
      <Card>
        <CardContent className="flex flex-col gap-ds-16 p-ds-24">
          <p className="text-h3" aria-live="polite">{message}</p>
          <div
            className="h-2 overflow-hidden rounded-ds-full bg-secondary"
            role="progressbar"
            aria-label="Progresso da geração"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-wrap gap-ds-16 text-body text-muted-foreground">
            <p>Etapa {currentStep} de {total}</p>
            <p>{landingId ? "Concluído" : error ? "Interrompido" : remainingSeconds === 1 ? "Tempo estimado: 1 segundo" : `Tempo estimado: ${remainingSeconds} segundos`}</p>
          </div>
        </CardContent>
      </Card>
      {landingId ? (
        <div className="flex flex-col gap-ds-16 sm:flex-row">
          <Button asChild className="h-12 px-ds-24 sm:min-w-64">
            <Link href={`/admin/landing-pages/${landingId}`}>Abrir Landing</Link>
          </Button>
          <Button asChild variant="secondary" className="h-12 px-ds-24">
            <Link href="/admin#campanhas">Voltar para campanhas</Link>
          </Button>
        </div>
      ) : null}
      <ol className="flex flex-col gap-ds-12" aria-label="Etapas da landing page">
        {LANDING_GENERATION_STEPS.map((step) => {
          const status = progress[step.id];
          const Icon = ICONS[step.id];
          return (
            <li key={step.id} id={step.id === "ready" ? "landing-pronta" : undefined}>
              <Card>
                <CardContent className="flex items-center gap-ds-16 p-ds-16">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ds-md bg-secondary text-foreground">
                    <Icon aria-hidden size={20} strokeWidth={1.5} />
                  </span>
                  <p className="min-w-0 flex-1 text-h3">{step.label}</p>
                  <StatusMark status={status} label={step.label} />
                </CardContent>
              </Card>
              {errorStep === step.id && error ? (
                <div className="mt-ds-12 flex flex-col items-start gap-ds-12">
                  <Alert tone="danger" title="Erro">{error}</Alert>
                  <Button type="button" onClick={() => setAttempt((current) => current + 1)}>
                    Tentar novamente
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div>
        <Button asChild variant="secondary">
          <Link href={backHref}>Voltar à estratégia</Link>
        </Button>
      </div>
    </div>
  );
}

function StatusMark({ status, label }: { status: LandingGenerationStatus; label: string }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-ds-8 text-body text-primary">
        <Loader2 className="motion-safe:animate-spin" aria-hidden size={18} />
        <span className="sr-only">{label}: </span>
        {STATUS_LABEL.running}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-ds-8 text-body text-success">
        <CircleCheck aria-hidden size={18} />
        <span className="sr-only">{label}: </span>
        {STATUS_LABEL.completed}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-ds-8 text-body text-danger">
        <CircleAlert aria-hidden size={18} />
        <span className="sr-only">{label}: </span>
        {STATUS_LABEL.error}
      </span>
    );
  }
  return <span className="text-body text-muted-foreground">{STATUS_LABEL.waiting}</span>;
}
