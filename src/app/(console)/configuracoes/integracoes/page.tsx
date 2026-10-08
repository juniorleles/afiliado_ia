import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { readGoogleAdsIntegrationStatus } from "@/lib/integrations/google-ads-oauth/status";
import { GoogleAdsMark } from "./google-ads/google-ads-mark";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function IntegracoesPage() {
  const googleAds = readGoogleAdsIntegrationStatus();
  return (
    <PageTemplate title="Integrações" description="Contas externas ligadas a esta instalação. Nenhum segredo é mostrado." primaryAction={null}>
      <section aria-label="Integrações disponíveis" className="grid grid-cols-1 gap-ds-16 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Google Ads</CardTitle>
            <Badge tone={googleAds.connectionTone}>{googleAds.connection}</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-ds-12">
              <GoogleAdsMark />
              <p className="text-body text-muted-foreground">Autenticação OAuth da conta de anúncios.</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary">
              <Link href="/configuracoes/integracoes/google-ads">Abrir Google Ads</Link>
            </Button>
          </CardFooter>
        </Card>
      </section>
    </PageTemplate>
  );
}
