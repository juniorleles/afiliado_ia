import type { ReactNode } from "react";
import Link from "next/link";
import DiscoveryDashboardPage from "@/app/admin/discovery/page";
import DiscoveryQueuePage from "@/app/admin/discovery/queue/page";
import { WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { buildDashboard, formatDuration } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime, readDiscoveryState } from "@/lib/discovery/discovery-runtime";
import { collectEnvIssues, getAppEnv } from "@/lib/env";
import { productionReadiness, type ReadinessFlag, type ReadinessReport } from "@/lib/readiness";
import { listValidationRuns } from "@/lib/validation/store";
import packageJson from "../../../../package.json";

export const SYSTEM_SECTION_IDS = ["visao", "descoberta", "integracoes", "diagnostico", "registros", "fila"] as const;
export type SystemSection = (typeof SYSTEM_SECTION_IDS)[number];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function systemSection(value: string | string[] | undefined): SystemSection {
  const raw = one(value);
  return SYSTEM_SECTION_IDS.includes(raw as SystemSection) ? (raw as SystemSection) : "visao";
}

function sectionHref(secao: SystemSection) {
  return secao === "visao" ? "/admin/system/readiness" : `/admin/system/readiness?secao=${secao}`;
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function Embed({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">{children}</div>;
}

type Tone = "success" | "warning" | "danger" | "neutral";

function flagTone(flag: ReadinessFlag): Tone {
  if (flag === "READY") return "success";
  if (flag === "MISSING") return "danger";
  return "warning";
}

function flagLabel(flag: ReadinessFlag) {
  if (flag === "READY") return "Pronto";
  if (flag === "MISSING") return "Ausente";
  return "Opcional";
}

function levelTone(level: string): Tone {
  if (level === "OK") return "success";
  if (level === "ERROR") return "danger";
  if (level === "WARNING") return "warning";
  return "neutral";
}

function levelLabel(level: string) {
  if (level === "OK") return "Ok";
  if (level === "ERROR") return "Erro";
  if (level === "WARNING") return "Atenção";
  return level;
}

function toneClass(tone: Tone) {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-foreground";
}

function publicMessage(text: string) {
  const line = text.split(/\r?\n/).map((row) => row.trim()).find((row) => row && !row.startsWith("at "));
  return line || "Erro sem detalhe";
}

type LogRow = { id: string; at: string; message: string };

export function SystemCenter({ secao }: { secao: SystemSection }) {
  const now = new Date();
  const readiness = productionReadiness();
  const config = readIntegrationConfiguration();
  const discovery = readDiscovery();
  const runs = readRuns();
  const envIssues = collectEnvIssues();
  const adsConnected = config.googleAds === "Connected";
  const searchReady = config.searchApi === "SET";
  const databaseTone = flagTone(readiness.DATABASE);
  const discoveryLevel = discovery?.health.overall ?? "WARNING";
  const systemTone: Tone = readiness.DATABASE !== "READY" || discoveryLevel === "ERROR" || envIssues.some((issue) => issue.fatal)
    ? "danger"
    : discoveryLevel === "WARNING" || !searchReady || !adsConnected || envIssues.length > 0
      ? "warning"
      : "success";
  const systemLabel = systemTone === "danger" ? "Atenção crítica" : systemTone === "warning" ? "Atenção" : "Operacional";
  const envLabel = getAppEnv() === "production" ? "Produção" : getAppEnv() === "test" ? "Teste" : "Desenvolvimento";

  return (
    <section aria-label="Central do sistema" className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header>
        <h1 className="text-h1">Central do sistema</h1>
        <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Versão da plataforma" value={packageJson.version} />
          <Field label="Ambiente" value={envLabel} />
          <div>
            <dt className="text-caption text-muted-foreground">Status do sistema</dt>
            <dd className="mt-ds-4"><Badge tone={systemTone}>{systemLabel}</Badge></dd>
          </div>
          <Field label="Última verificação" value={`${formatUpdated(now.toISOString())} · Nesta leitura`} />
          <div>
            <dt className="text-caption text-muted-foreground">SearchApi</dt>
            <dd className="mt-ds-4"><Badge tone={searchReady ? "success" : "warning"}>{searchReady ? "Configurado" : "Ausente"}</Badge></dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Google Ads</dt>
            <dd className="mt-ds-4"><Badge tone={adsConnected ? "success" : "warning"}>{adsConnected ? "Conectado" : "Google Ads não conectado"}</Badge></dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Banco de dados</dt>
            <dd className="mt-ds-4"><Badge tone={databaseTone}>{flagLabel(readiness.DATABASE)}</Badge></dd>
          </div>
        </dl>
      </header>

      <WorkspaceTabs
        label="Áreas do sistema"
        current={secao}
        labelledBy="system-tab"
        items={[
          { id: "visao", href: sectionHref("visao"), label: "Visão geral" },
          { id: "descoberta", href: sectionHref("descoberta"), label: "Descoberta" },
          { id: "integracoes", href: sectionHref("integracoes"), label: "Integrações" },
          { id: "diagnostico", href: sectionHref("diagnostico"), label: "Diagnóstico" },
          { id: "registros", href: sectionHref("registros"), label: "Registros" },
          { id: "fila", href: sectionHref("fila"), label: "Fila" },
        ]}
      />

      {secao === "visao" ? <Overview readiness={readiness} discovery={discovery} runs={runs} searchReady={searchReady} adsConnected={adsConnected} systemLabel={systemLabel} systemTone={systemTone} /> : null}
      {secao === "descoberta" ? <DiscoveryPanel discovery={discovery} /> : null}
      {secao === "integracoes" ? <Integrations searchReady={searchReady} adsConnected={adsConnected} envLabel={envLabel} /> : null}
      {secao === "diagnostico" ? <Diagnostics readiness={readiness} envIssues={envIssues} /> : null}
      {secao === "registros" ? <Logs discovery={discovery} runs={runs} envIssues={envIssues} now={now.toISOString()} /> : null}
      {secao === "fila" ? <QueuePanel discovery={discovery} /> : null}
    </section>
  );
}

function Overview({
  readiness,
  discovery,
  runs,
  searchReady,
  adsConnected,
  systemLabel,
  systemTone,
}: {
  readiness: ReadinessReport;
  discovery: DiscoverySnapshot | null;
  runs: Array<{ id: string; createdAt: string; status: string }>;
  searchReady: boolean;
  adsConnected: boolean;
  systemLabel: string;
  systemTone: Tone;
}) {
  const queue = discovery?.queue;
  const failed = queue?.failed ?? 0;
  const queueTone: Tone = !discovery ? "warning" : failed > 0 ? "warning" : queue && queue.queued + queue.processing > 0 ? "neutral" : "success";
  const latest = runs[0];
  return (
    <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard title="Saúde da plataforma" value={systemLabel} tone={systemTone} href={sectionHref("diagnostico")} />
      <StatusCard title="SearchApi" value={searchReady ? "Configurado" : "Ausente"} tone={searchReady ? "success" : "warning"} href={sectionHref("integracoes")} />
      <StatusCard title="Google Ads" value={adsConnected ? "Conectado" : "Google Ads não conectado"} tone={adsConnected ? "success" : "warning"} href={sectionHref("integracoes")} />
      <StatusCard title="Banco de dados" value={flagLabel(readiness.DATABASE)} tone={flagTone(readiness.DATABASE)} href={sectionHref("diagnostico")} />
      <StatusCard title="Descoberta" value={discovery ? levelLabel(discovery.health.overall) : "Sem leitura"} tone={discovery ? levelTone(discovery.health.overall) : "warning"} href={sectionHref("descoberta")} />
      <StatusCard title="Validação" value={latest ? latest.status : "Nenhuma run"} tone={latest?.status === "FAILED" ? "danger" : latest ? "success" : "neutral"} href="/admin/validation" />
      <StatusCard title="Fila" value={queue ? `${queue.queued} pendentes` : "Sem leitura"} tone={queueTone} href={sectionHref("fila")} />
      <StatusCard title="Trabalhos em segundo plano" value={queue && queue.processing > 0 ? `${queue.processing} em processamento` : "Nenhum em execução"} tone={queue && queue.processing > 0 ? "warning" : "success"} href="/admin/discovery/scheduler" />
    </div>
  );
}

function DiscoveryPanel({ discovery }: { discovery: DiscoverySnapshot | null }) {
  return (
    <div className="flex flex-col gap-ds-16">
      {discovery ? (
        <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard title="Saúde" value={levelLabel(discovery.health.overall)} tone={levelTone(discovery.health.overall)} href="/admin/discovery/health" />
          <StatusCard title="Fontes" value={String(discovery.registered)} tone="neutral" href="/admin/discovery/sources" />
          <StatusCard title="Fila" value={`${discovery.queue.queued} pendentes`} tone={discovery.queue.failed > 0 ? "warning" : "neutral"} href="/admin/discovery/queue" />
          <StatusCard title="Agendador" value={levelLabel(discovery.health.scheduler)} tone={levelTone(discovery.health.scheduler)} href="/admin/discovery/scheduler" />
          <Field label="Última execução" value={discovery.scheduler.lastExecution ? formatUpdated(discovery.scheduler.lastExecution) : "Não registrada"} />
          <Field label="Trabalhos pendentes" value={String(discovery.queue.queued)} />
          <Field label="Erros" value={String(discovery.health.errors.length)} />
          <Field label="Avisos" value={String(discovery.health.warnings.length)} />
        </div>
      ) : (
        <p className="text-body text-muted-foreground">Sem leitura da descoberta.</p>
      )}
      <div className="flex flex-wrap gap-ds-8">
        <Button asChild variant="secondary"><Link href="/admin/discovery/health">Saúde</Link></Button>
        <Button asChild variant="secondary"><Link href="/admin/discovery/sources">Fontes</Link></Button>
        <Button asChild variant="secondary"><Link href="/admin/discovery/queue">Fila</Link></Button>
        <Button asChild variant="secondary"><Link href="/admin/discovery/scheduler">Agendador</Link></Button>
      </div>
      <Embed>
        <DiscoveryDashboardPage />
      </Embed>
    </div>
  );
}

function Integrations({ searchReady, adsConnected, envLabel }: { searchReady: boolean; adsConnected: boolean; envLabel: string }) {
  return (
    <div className="grid gap-ds-16 lg:grid-cols-2">
      <Card>
        <CardContent>
          <h2 className="text-h3">SearchApi</h2>
          <dl className="mt-ds-12 flex flex-col gap-ds-8">
            <Field label="Status" value={searchReady ? "Configurado" : "Ausente"} />
            <Field label="Última requisição" value="Não registrada" />
            <Field label="Cota" value="Não disponível" />
            <Field label="Última pesquisa bem-sucedida" value="Não registrada" />
            <Field label="Tempo médio de resposta" value="Não disponível" />
            <Field label="Último erro" value="Nenhum erro gravado" />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="text-h3">Google Ads</h2>
          <p className="mt-ds-8 text-body">{adsConnected ? "Conectado" : "Google Ads não conectado"}</p>
          <dl className="mt-ds-12 flex flex-col gap-ds-8">
            <Field label="Developer token" value="Não exibido" />
            <Field label="Customer" value="Não exibido" />
            <Field label="Ambiente" value={envLabel} />
            <Field label="Última sincronização" value="Não registrada" />
            <Field label="Rascunhos" value="Não observados" />
            <Field label="Publicados" value="Não observados" />
            <Field label="Sincronização" value={adsConnected ? "Nenhuma sincronização gravada" : "Google Ads não conectado"} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Diagnostics({
  readiness,
  envIssues,
}: {
  readiness: ReadinessReport;
  envIssues: Array<{ name: string; message: string; fatal: boolean }>;
}) {
  const typescriptVersion = packageJson.devDependencies.typescript || "Não observada";
  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Node" value={process.version} />
        <Field label="Banco de dados" value={flagLabel(readiness.DATABASE)} />
        <Field label="Sistema de arquivos" value={flagLabel(readiness.MEDIA_STORAGE)} />
        <Field label="Build" value="Não observada" />
        <Field label="TypeScript" value={typescriptVersion} />
        <Field label="Validação do ambiente" value={envIssues.length === 0 ? "Sem pendências" : `${envIssues.length} pendência${envIssues.length === 1 ? "" : "s"}`} />
      </div>
      {envIssues.length === 0 ? (
        <p className="text-body text-muted-foreground">Nenhuma pendência de ambiente nesta leitura.</p>
      ) : (
        <ul className="flex flex-col gap-ds-8 text-body">
          {envIssues.map((issue) => (
            <li key={`${issue.name}-${issue.message}`}>{issue.fatal ? "Erro" : "Aviso"} · {issue.name}: {issue.message}</li>
          ))}
        </ul>
      )}
      <Embed>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Production readiness</h2>
          <p className="text-sm text-zinc-400">Operational diagnostic. Secrets are never shown.</p>
          <dl className="grid gap-2 text-sm">
            {Object.entries(readiness).map(([key, value]) => (
              <div key={key} className="flex justify-between rounded-md border border-zinc-800 px-3 py-2">
                <dt className="font-mono text-zinc-400">{key}</dt>
                <dd className="font-medium text-zinc-100">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Embed>
    </div>
  );
}

function Logs({
  discovery,
  runs,
  envIssues,
  now,
}: {
  discovery: DiscoverySnapshot | null;
  runs: Array<{ id: string; createdAt: string; status: string; notes: string }>;
  envIssues: Array<{ name: string; message: string; fatal: boolean }>;
  now: string;
}) {
  const errors: LogRow[] = [];
  const warnings: LogRow[] = [];
  for (const issue of envIssues) {
    const row = { id: `env-${issue.name}`, at: now, message: `${issue.name}: ${issue.message}` };
    if (issue.fatal) errors.push(row);
    else warnings.push(row);
  }
  for (const issue of discovery?.health.errors ?? []) {
    errors.push({ id: `disc-err-${issue.subject ?? issue.message}`, at: now, message: publicMessage(issue.message) });
  }
  for (const issue of discovery?.health.warnings ?? []) {
    warnings.push({ id: `disc-warn-${issue.subject ?? issue.message}`, at: now, message: publicMessage(issue.message) });
  }
  for (const item of discovery?.failures ?? []) {
    errors.push({ id: item.id, at: item.at, message: publicMessage(item.message) });
  }
  const information: LogRow[] = runs.map((run) => ({
    id: run.id,
    at: run.createdAt,
    message: `${run.status}${run.notes ? ` · ${run.notes}` : ""}`,
  }));

  return (
    <div className="flex flex-col gap-ds-16">
      <LogList title="Erros" rows={errors} empty="Nenhum erro nesta leitura." />
      <LogList title="Avisos" rows={warnings} empty="Nenhum aviso nesta leitura." />
      <LogList title="Informação" rows={information} empty="Nenhum evento informativo gravado." />
      <LogList title="Eventos de validação" rows={information} empty="Nenhuma run gravada." />
      <LogList
        title="Eventos de descoberta"
        rows={[...errors, ...warnings].filter((row) => row.id.startsWith("disc-") || discovery?.failures.some((item) => item.id === row.id))}
        empty="Nenhum evento de descoberta nesta leitura."
      />
      <LogList title="Eventos de pesquisa" rows={[]} empty="Nenhum evento de pesquisa gravado." />
    </div>
  );
}

function QueuePanel({ discovery }: { discovery: DiscoverySnapshot | null }) {
  const queue = discovery?.queue;
  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Pendentes" value={queue ? String(queue.queued) : "Sem leitura"} />
        <Field label="Em execução" value={queue ? String(queue.processing) : "Sem leitura"} />
        <Field label="Concluídos" value={queue ? String(queue.completed) : "Sem leitura"} />
        <Field label="Falhos" value={queue ? String(queue.failed) : "Sem leitura"} />
        <Field label="Duração média" value={queue ? formatDuration(queue.averageProcessingMs) : "—"} />
      </div>
      <Embed>
        <DiscoveryQueuePage />
      </Embed>
    </div>
  );
}

function LogList({ title, rows, empty }: { title: string; rows: LogRow[]; empty: string }) {
  const ordered = [...rows].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 8);
  return (
    <section aria-labelledby={`log-${title}`}>
      <h2 id={`log-${title}`} className="text-h3">{title}</h2>
      {ordered.length === 0 ? (
        <p className="mt-ds-8 text-body text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-ds-8 flex flex-col gap-ds-8">
          {ordered.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent>
                  <p className="text-caption text-muted-foreground">{formatUpdated(row.at)}</p>
                  <p className="mt-ds-4 text-body">{row.message}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatusCard({ title, value, tone, href }: { title: string; value: string; tone: Tone; href: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-caption text-muted-foreground">{title}</p>
        <p className={`mt-ds-4 text-h3 ${toneClass(tone)}`}>{value}</p>
        <Button asChild variant="secondary" className="mt-ds-8">
          <Link href={href}>Abrir</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}

type DiscoverySnapshot = {
  registered: number;
  health: { overall: string; scheduler: string; errors: Array<{ subject: string | null; message: string }>; warnings: Array<{ subject: string | null; message: string }> };
  queue: { queued: number; processing: number; completed: number; failed: number; averageProcessingMs: number | null };
  scheduler: { lastExecution: string | null };
  failures: Array<{ id: string; at: string; message: string }>;
};

function readDiscovery(): DiscoverySnapshot | null {
  try {
    const state = readDiscoveryState(getDiscoveryRuntime());
    const dashboard = buildDashboard(state, new Date());
    return {
      registered: dashboard.registered,
      health: dashboard.health,
      queue: dashboard.queue,
      scheduler: { lastExecution: dashboard.scheduler.lastExecution },
      failures: state.queueItems
        .filter((item) => item.status === "FAILED" || item.errorMessage)
        .map((item) => ({ id: item.id, at: item.updatedAt || item.createdAt, message: item.errorMessage || item.status })),
    };
  } catch {
    return null;
  }
}

function readRuns() {
  try {
    return listValidationRuns().map((run) => ({ id: run.id, createdAt: run.createdAt, status: run.status, notes: run.notes }));
  } catch {
    return [];
  }
}
