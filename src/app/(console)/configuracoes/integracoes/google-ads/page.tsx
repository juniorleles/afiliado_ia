import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTemplate } from "@/components/layout/page-template";
import { GOOGLE_ADS_NOTICE, readGoogleAdsIntegrationStatus, type Presence } from "@/lib/integrations/google-ads-oauth/status";
import { disconnectGoogleAdsAction, selectGoogleAdsAccountAction, testGoogleAdsConnectionAction } from "./actions";
import { GoogleAdsMark } from "./google-ads-mark";

export const metadata: Metadata = { title: "Google Ads" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-body">{value}</p>
      </CardContent>
    </Card>
  );
}

function PresenceField({ label, value }: { label: string; value: Presence }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <Badge tone={value === "Configurado" ? "success" : "warning"}>{value}</Badge>
      </CardHeader>
    </Card>
  );
}

export default async function GoogleAdsIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string | string[]; erro?: string | string[] }>;
}) {
  const status = readGoogleAdsIntegrationStatus();
  const query = await searchParams;
  const aviso = Array.isArray(query.aviso) ? query.aviso[0] : query.aviso;
  const erro = Array.isArray(query.erro) ? query.erro[0] : query.erro;
  const googleError = typeof erro === "string" && /^[a-z_]{1,40}$/.test(erro) ? erro : "";
  const notice = aviso ? GOOGLE_ADS_NOTICE[aviso] : undefined;
  return (
    <PageTemplate
      title="Google Ads"
      description="Conecte uma conta com o Google. Nenhum token aparece nesta tela, e nenhuma campanha é publicada."
      primaryAction={
        status.canConnect ? (
          <Button asChild>
            <Link href="/configuracoes/integracoes/google-ads/conectar">
              {status.refreshToken === "Configurado" ? "Reconectar" : "Conectar Google Ads"}
            </Link>
          </Button>
        ) : (
          <Button type="button" disabled>
            Conectar Google Ads
          </Button>
        )
      }
    >
      <section aria-label="Central de integração do Google Ads" className="flex flex-col gap-ds-24">
        <div className="flex flex-wrap items-center gap-ds-16">
          <GoogleAdsMark />
          <div className="min-w-0">
            <p className="text-label text-muted-foreground">Status da conexão</p>
            <Badge tone={status.connectionTone}>{status.connection}</Badge>
          </div>
        </div>
        {notice ? (
          <Alert tone={notice.tone} title={notice.title}>
            {aviso === "google" && googleError ? `${notice.detail} Código do Google: ${googleError}.` : notice.detail}
          </Alert>
        ) : (
          status.blockers.map((blocker) => (
            <Alert key={blocker} tone={GOOGLE_ADS_NOTICE[blocker].tone} title={GOOGLE_ADS_NOTICE[blocker].title}>
              {GOOGLE_ADS_NOTICE[blocker].detail}
            </Alert>
          ))
        )}
        <div className="flex flex-wrap gap-ds-8">
          <form action={testGoogleAdsConnectionAction}>
            <Button type="submit" variant="secondary" disabled={!status.canTest}>
              Atualizar
            </Button>
          </form>
          <form action={disconnectGoogleAdsAction}>
            <Button type="submit" variant="danger" disabled={!status.canDisconnect}>
              Desconectar
            </Button>
          </form>
        </div>
        <section aria-labelledby="painel-google-ads">
          <h2 id="painel-google-ads" className="text-h3">Painel da conexão</h2>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Conta conectada" value={status.account} />
            <Field label="ID do cliente" value={status.customerId} />
            <Field label="Moeda" value={status.currency} />
            <Field label="Fuso horário" value={status.timeZone} />
            <Field label="Gerente" value={status.manager} />
            <Field label="Campanhas" value={status.campaignCount} />
            <Field label="Status OAuth" value={status.oauthStatus} />
            <Field label="Status da API" value={status.apiStatus} />
            <Field label="Ambiente" value={status.environment} />
            <Field label="Nível de acesso" value={status.accessLevel} />
            <Field label="Última sincronização" value={status.lastSynchronization} />
          </div>
        </section>
        <section aria-labelledby="sincronizacao-google-ads">
          <h2 id="sincronizacao-google-ads" className="text-h3">Sincronização</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">Leitura da conta, do projeto e da versão da API. Nenhuma campanha é publicada.</p>
          <div className="mt-ds-16 flex flex-wrap gap-ds-8">
            {(["Conectado", "Desconectado", "Precisa de autorização", "Erro de permissão"] as const).map((label) => (
              <Badge key={label} tone={label === status.syncLabel ? status.syncTone : "neutral"}>{label}</Badge>
            ))}
          </div>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Informação do cliente" value={status.customerHealth} />
            <Field label="Contas acessíveis" value={String(status.accounts.length)} />
            <Field label="Projeto do Google Cloud" value={status.cloudProject} />
            <Field label="Cliente OAuth" value={status.oauthClient} />
            <Field label="Versão da API" value={status.apiVersion} />
            <Field label="Nível de acesso do Google Ads" value={status.accessLevel} />
            <Field label="Ambiente" value={status.environment} />
            <Field label="ID do cliente de login" value={status.loginCustomerId} />
          </div>
        </section>
        <section aria-labelledby="contas-google-ads">
          <h2 id="contas-google-ads" className="text-h3">Contas conectadas</h2>
          {status.accounts.length === 0 ? (
            <div className="mt-ds-16">
              <EmptyState title="Nenhuma conta descoberta" description="Conecte o Google Ads para listar as contas acessíveis." icon="recommendation" />
            </div>
          ) : (
            <ul className="mt-ds-16 grid grid-cols-1 gap-ds-16 lg:grid-cols-2">
              {status.accounts.map((account) => (
                <li key={account.customerId}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{account.accountName || "Conta sem nome"}</CardTitle>
                      <span className="flex flex-wrap gap-ds-8">
                        {account.manager ? <Badge tone="info">Gerente</Badge> : null}
                        {account.testAccount ? <Badge tone="review">Conta de teste</Badge> : null}
                        {account.selected ? <Badge tone="success">Ativa</Badge> : null}
                      </span>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-ds-8">
                      <p className="text-body">ID do cliente {account.customerId}</p>
                      <p className="text-body">Moeda {account.currencyCode || "Não observada"}</p>
                      <p className="text-body">Fuso {account.timeZone || "Não observado"}</p>
                      <p className="text-body">Status {account.accountStatus || "Não observado"}</p>
                      <p className="text-body">Acesso {account.accessLevel || "Não observado"}</p>
                      <p className="text-body">Campanhas {account.campaignCount ?? "Não lida"} · ativas {account.enabledCount ?? "Não lida"} · pausadas {account.pausedCount ?? "Não lida"} · removidas {account.removedCount ?? "Não lida"}</p>
                      {account.selected ? null : (
                        <form action={selectGoogleAdsAccountAction}>
                          <input type="hidden" name="customerId" value={account.customerId} />
                          <Button type="submit" variant="secondary">Selecionar conta ativa</Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="saude-google-ads">
          <h2 id="saude-google-ads" className="text-h3">Saúde da conexão</h2>
          <Card className="mt-ds-16">
            <CardContent className="grid grid-cols-1 gap-ds-12 sm:grid-cols-2">
              <p className="text-body"><span className="text-muted-foreground">OAuth </span>{status.oauthHealth}</p>
              <p className="text-body"><span className="text-muted-foreground">API do Google Ads </span>{status.apiHealth}</p>
              <p className="text-body"><span className="text-muted-foreground">Refresh token </span>{status.refreshToken}</p>
              <p className="text-body"><span className="text-muted-foreground">Cliente </span>{status.customerHealth}</p>
              <p className="text-body"><span className="text-muted-foreground">Escopos </span>{status.scopeHealth}</p>
              <p className="text-body"><span className="text-muted-foreground">Latência </span>{status.latency}</p>
              <p className="text-body"><span className="text-muted-foreground">Última sincronização bem-sucedida </span>{status.lastSuccessfulSync}</p>
              <p className="text-body"><span className="text-muted-foreground">Último erro </span>{status.lastError ?? "Nenhum"}</p>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="permissoes-google-ads">
          <h2 id="permissoes-google-ads" className="text-h3">Permissões</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">A leitura foi consultada. A escrita reflete o papel de acesso observado. Nenhuma alteração foi enviada.</p>
          <ul className="mt-ds-16 grid grid-cols-1 gap-ds-12 sm:grid-cols-2">
            {(
              [
                ["Leitura de campanhas", status.permissions.campaignRead],
                ["Escrita de campanhas", status.permissions.campaignWrite],
                ["Grupos de anúncios", status.permissions.adGroup],
                ["Anúncios", status.permissions.ads],
                ["Palavras-chave", status.permissions.keywords],
                ["Relatórios", status.permissions.reporting],
                ["Ativos", status.permissions.assets],
              ] as const
            ).map(([label, value]) => (
              <li key={label} className="flex items-center justify-between gap-ds-12">
                <span className="text-body">{label}</span>
                <Badge tone={value === "granted" ? "success" : "warning"}>{value === "granted" ? "Concedida" : "Ausente"}</Badge>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="credenciais-google-ads">
          <h2 id="credenciais-google-ads" className="text-h3">Credenciais</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">Os valores ficam no servidor. Aqui só aparece se cada um está configurado.</p>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
            <PresenceField label="Identificador do cliente" value={status.clientId} />
            <PresenceField label="Segredo do cliente" value={status.clientSecret} />
            <PresenceField label="Refresh token" value={status.refreshToken} />
            <PresenceField label="URI de retorno" value={status.redirectUri} />
          </div>
        </section>
      </section>
    </PageTemplate>
  );
}
