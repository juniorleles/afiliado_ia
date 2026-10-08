import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { GOOGLE_ADS_NOTICE, readGoogleAdsIntegrationStatus, type Presence } from "@/lib/integrations/google-ads-oauth/status";
import { disconnectGoogleAdsAction, testGoogleAdsConnectionAction } from "./actions";
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
  searchParams: Promise<{ aviso?: string | string[] }>;
}) {
  const status = readGoogleAdsIntegrationStatus();
  const query = await searchParams;
  const aviso = Array.isArray(query.aviso) ? query.aviso[0] : query.aviso;
  const notice = aviso ? GOOGLE_ADS_NOTICE[aviso] : undefined;
  return (
    <PageTemplate
      title="Google Ads"
      description="Conecte uma conta com o Google. Nenhum token aparece nesta tela, e nenhuma campanha é publicada."
      primaryAction={
        status.canConnect ? (
          <Button asChild>
            <Link href="/configuracoes/integracoes/google-ads/conectar">Conectar Google Ads</Link>
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
            {notice.detail}
          </Alert>
        ) : (
          status.blockers.map((blocker) => (
            <Alert key={blocker} tone={GOOGLE_ADS_NOTICE[blocker].tone} title={GOOGLE_ADS_NOTICE[blocker].title}>
              {GOOGLE_ADS_NOTICE[blocker].detail}
            </Alert>
          ))
        )}
        <div className="grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Conta conectada" value={status.account} />
          <Field label="Ambiente" value={status.environment} />
          <Field label="Última sincronização" value={status.lastSynchronization} />
          <Field label="Projeto do Google Cloud" value={status.cloudProject} />
          <Field label="Nível de acesso" value={status.accessLevel} />
          <Field label="Última conexão" value={status.lastConnection} />
        </div>
        <div className="flex flex-wrap gap-ds-8">
          <form action={testGoogleAdsConnectionAction}>
            <Button type="submit" variant="secondary" disabled={!status.canTest}>
              Testar conexão
            </Button>
          </form>
          <form action={disconnectGoogleAdsAction}>
            <Button type="submit" variant="danger" disabled={!status.canDisconnect}>
              Desconectar
            </Button>
          </form>
        </div>
        <section aria-labelledby="credenciais-google-ads">
          <h2 id="credenciais-google-ads" className="text-h3">Credenciais</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">Os valores ficam no servidor. Aqui só aparece se cada um está configurado.</p>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
            <PresenceField label="Identificador do cliente" value={status.clientId} />
            <PresenceField label="Segredo do cliente" value={status.clientSecret} />
            <PresenceField label="Refresh token" value={status.refreshToken} />
            <PresenceField label="URI de retorno" value={status.redirectUri} />
            <PresenceField label="Token de desenvolvedor" value={status.developerToken} />
          </div>
        </section>
        <section aria-labelledby="painel-google-ads">
          <h2 id="painel-google-ads" className="text-h3">Painel da conexão</h2>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Conexão" value={status.connection} />
            <Field label="Status OAuth" value={status.oauthStatus} />
            <Field label="Refresh token" value={status.refreshToken} />
            <Field label="ID do cliente" value={status.customerId} />
            <Field label="ID do cliente de login" value={status.loginCustomerId} />
            <Field label="Status da API" value={status.apiStatus} />
            <Field label="Nível de acesso" value={status.accessLevel} />
            <Field label="Último erro" value={status.lastError ?? "Nenhum"} />
          </div>
        </section>
      </section>
    </PageTemplate>
  );
}
