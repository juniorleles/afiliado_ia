import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { getDb } from "@/lib/db";
import { GOOGLE_ADS_NOTICE, readGoogleAdsIntegrationStatus } from "@/lib/integrations/google-ads-oauth/status";
import { readGoogleAdsAccounts } from "@/lib/integrations/google-ads-oauth/store";
import { readOperationsDashboard } from "@/lib/integrations/google-ads-operations/reports";
import { decideAction, executeAction, proposeAction, selectOperationsAccount, syncOperationsAction } from "./actions";

export const metadata: Metadata = { title: "Operações do Google Ads" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="text-h3">{value}</p></CardContent>
    </Card>
  );
}

export default async function GoogleAdsOperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const aviso = typeof query.aviso === "string" ? query.aviso : "";
  const googleError = typeof query.erro === "string" && /^[a-z_]{1,40}$/.test(query.erro) ? query.erro : "";
  const notice = aviso ? GOOGLE_ADS_NOTICE[aviso] : undefined;
  const status = readGoogleAdsIntegrationStatus();
  const connected = status.connection === "Conectado";
  const awaitingAccount = connected && status.accounts.length > 1 && !status.accounts.some((item) => item.selected);
  const view = readOperationsDashboard();
  const account = readGoogleAdsAccounts().find((item) => item.selected) ?? null;
  const publications = getDb().prepare("SELECT local_campaign_id, customer_id, campaign_resource_name, published_at FROM google_ads_publications ORDER BY published_at DESC").all() as {
    local_campaign_id: number;
    customer_id: string;
    campaign_resource_name: string | null;
    published_at: string;
  }[];
  const first = publications.find((item) => item.campaign_resource_name && (!account || item.customer_id === account.customerId)) ?? null;
  return (
    <PageTemplate title="Operações do Google Ads" description="Sincronização, métricas e recomendações. Nenhuma ação roda sem aprovação." primaryAction={<Button asChild variant="secondary"><Link href="/admin">Voltar</Link></Button>}>
      <div className="flex flex-col gap-ds-24">
        <section aria-labelledby="conexao-operacoes">
          <h2 id="conexao-operacoes" className="text-h3">Status</h2>
          <p className="mt-ds-8 text-body">{connected ? "Connected" : "Not Connected"}</p>
          {connected ? (
            <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
              <Metric label="Google account" value={status.account} />
              <Metric label="Customer ID" value={status.customerId} />
              <Metric label="Manager account" value={status.manager} />
              <Metric label="Timezone" value={status.timeZone} />
              <Metric label="Currency" value={status.currency} />
              <Metric label="Refresh token status" value={status.refreshToken} />
              <Metric label="Last synchronization" value={status.lastSynchronization} />
            </div>
          ) : (
            <a className={`${buttonVariants()} mt-ds-16`} href="/configuracoes/integracoes/google-ads/conectar">Connect Google Ads</a>
          )}
          {awaitingAccount ? (
            <div className="mt-ds-16 flex flex-col gap-ds-16">
              <h3 className="text-h3">Selecionar conta</h3>
              <ul className="grid grid-cols-1 gap-ds-16 lg:grid-cols-2">
                {status.accounts.map((item) => (
                  <li key={item.customerId}>
                    <Card>
                      <CardHeader>
                        <CardTitle>{item.accountName || "Conta sem nome"}</CardTitle>
                        {item.manager ? <Badge tone="info">Gerente</Badge> : null}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-ds-8">
                        <p className="text-body">Customer ID {item.customerId}</p>
                        <p className="text-body">Currency {item.currencyCode || "Não observada"}</p>
                        <p className="text-body">Timezone {item.timeZone || "Não observado"}</p>
                        <form action={selectOperationsAccount}>
                          <input type="hidden" name="customerId" value={item.customerId} />
                          <Button type="submit" variant="secondary">Selecionar conta</Button>
                        </form>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        {notice ? (
          <Alert tone={notice.tone} title={notice.title}>
            {aviso === "google" && googleError ? `${notice.detail} Código do Google: ${googleError}.` : notice.detail}
          </Alert>
        ) : null}
        {aviso === "sincronizada" ? <Alert tone="success" title="Sincronização gravada">As recomendações ficaram pendentes.</Alert> : null}
        {aviso === "approved" ? <Alert tone="success" title="Ação aprovada">A execução continua separada.</Alert> : null}
        {aviso === "rejected" ? <Alert tone="warning" title="Ação rejeitada">Nada foi enviado ao Google Ads.</Alert> : null}
        {aviso === "executada" ? <Alert tone="success" title="Ação executada">O snapshot anterior permanece intacto.</Alert> : null}
        {aviso === "proposta" ? <Alert tone="success" title="Ação proposta">Ela continua pendente até a aprovação.</Alert> : null}
        {aviso === "recusada" ? <Alert tone="danger" title="Operação recusada">Nada foi executado.</Alert> : null}
        <div className="grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Conta conectada" value={view.accountName} />
          <Metric label="Campanhas" value={String(view.campaigns)} />
          <Metric label="Ativas" value={String(view.active)} />
          <Metric label="Pausadas" value={String(view.paused)} />
          <Metric label="Conversões" value={view.conversions} />
          <Metric label="CPA" value={view.cpa} />
          <Metric label="ROAS" value={view.roas} />
          <Metric label="Gasto" value={view.spend} />
          <Metric label="Receita" value={view.revenue} />
          <Metric label="Recomendações" value={view.optimizationScore} />
          <Metric label="Ações pendentes" value={String(view.pending)} />
          <Metric label="Executadas hoje" value={String(view.executedToday)} />
        </div>
        <p className="text-body text-muted-foreground">Última sincronização: {view.lastSynchronization}. Janela coletada: {view.window}.</p>
        <section aria-labelledby="sincronizar-operacoes">
          <h2 id="sincronizar-operacoes" className="text-h3">Sincronizar</h2>
          {first ? (
            <form action={syncOperationsAction} className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2">
              <input type="hidden" name="customerId" value={first.customer_id} />
              <input type="hidden" name="resourceName" value={first.campaign_resource_name ?? ""} />
              <label className="text-body">Período
                <select className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="window" defaultValue="LAST_30_DAYS">
                  <option value="TODAY">Hoje</option>
                  <option value="YESTERDAY">Ontem</option>
                  <option value="LAST_7_DAYS">Últimos 7 dias</option>
                  <option value="LAST_30_DAYS">Últimos 30 dias</option>
                  <option value="CUSTOM">Personalizado</option>
                </select>
              </label>
              <label className="text-body">Início
                <input className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="metricStart" type="date" />
              </label>
              <label className="text-body">Fim
                <input className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="metricEnd" type="date" />
              </label>
              <Button type="submit" disabled={!connected}>Sincronizar</Button>
            </form>
          ) : (
            <div className="mt-ds-16 flex flex-col gap-ds-8">
              <Button type="button" disabled>Sincronizar</Button>
              <p className="text-body text-muted-foreground">{connected ? "Nenhuma campanha publicada está disponível para sincronizar." : "A sincronização fica indisponível até a conexão OAuth terminar."}</p>
            </div>
          )}
        </section>
        <section aria-labelledby="aprovacoes-operacoes">
          <h2 id="aprovacoes-operacoes" className="text-h3">Central de aprovação</h2>
          <ul className="mt-ds-16 flex flex-col gap-ds-16">
            {view.actions.length === 0 ? <li className="text-body text-muted-foreground">Nenhuma ação.</li> : null}
            {view.actions.map((action) => (
              <li key={action.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{action.label}</CardTitle>
                    <Badge tone={action.status === "executed" ? "success" : action.status === "rejected" ? "danger" : "warning"}>{action.status}</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-ds-8 text-body">
                    <p>{action.reason}</p>
                    <p>Confiança: {action.confidence}</p>
                    <p>Impacto esperado: {action.expectedImpact}</p>
                    <p>Recurso: {action.resourceName}</p>
                    {action.status === "pending" ? (
                      <form action={decideAction} className="flex flex-wrap items-end gap-ds-8">
                        <input type="hidden" name="id" value={action.id} />
                        <label className="text-body">Orçamento em micros
                          <input className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="amount" type="number" min="1" />
                        </label>
                        <Button type="submit" name="decision" value="approved">Aprovar</Button>
                        <Button type="submit" name="decision" value="rejected" variant="secondary">Rejeitar</Button>
                      </form>
                    ) : null}
                    {action.status === "approved" ? (
                      <form action={executeAction}>
                        <input type="hidden" name="id" value={action.id} />
                        <Button type="submit">Executar aprovada</Button>
                      </form>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {first?.campaign_resource_name ? (
            <form action={proposeAction} className="mt-ds-16 grid grid-cols-1 gap-ds-12 sm:grid-cols-2">
              <label className="text-body">Ação
                <select className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="kind" defaultValue="PAUSE_CAMPAIGN">
                  <option value="PAUSE_CAMPAIGN">Pausar campanha</option>
                  <option value="RESUME_CAMPAIGN">Retomar campanha</option>
                  <option value="PAUSE_AD_GROUP">Pausar grupo</option>
                  <option value="RESUME_AD_GROUP">Retomar grupo</option>
                  <option value="PAUSE_KEYWORD">Pausar palavra</option>
                  <option value="ENABLE_KEYWORD">Ativar palavra</option>
                  <option value="BUDGET_UPDATE">Atualizar orçamento</option>
                  <option value="RSA_UPDATE">Atualizar RSA</option>
                  <option value="NEGATIVE_KEYWORD">Palavra negativa</option>
                </select>
              </label>
              <label className="text-body">Recurso já sincronizado
                <input className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="resourceName" defaultValue={first.campaign_resource_name} />
              </label>
              <Button type="submit" variant="secondary">Propor ação</Button>
            </form>
          ) : null}
        </section>
        <section aria-labelledby="linha-operacoes">
          <h2 id="linha-operacoes" className="text-h3">Linha do tempo</h2>
          <ul className="mt-ds-16 flex flex-col gap-ds-8 text-body">
            {publications.map((item) => <li key={item.local_campaign_id}>Publicação · {item.published_at} · {item.campaign_resource_name ?? "sem recurso"}</li>)}
            {view.events.map((event) => <li key={event.id}>{event.kind} · {event.createdAt} · {event.operator} · {event.detail}</li>)}
            {publications.length === 0 && view.events.length === 0 ? <li>Nenhum evento.</li> : null}
          </ul>
        </section>
        <section aria-labelledby="relatorios-operacoes">
          <h2 id="relatorios-operacoes" className="text-h3">Relatórios</h2>
          <div className="mt-ds-16 flex flex-wrap gap-ds-8">
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=campanha">Desempenho CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=otimizacao">Otimização CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=orcamento">Orçamento CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=palavras">Palavras CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=anuncios">RSA CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/exportar?tipo=executivo">Executivo CSV</Link></Button>
            <Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes/imprimir">Exportar PDF</Link></Button>
          </div>
        </section>
      </div>
    </PageTemplate>
  );
}
