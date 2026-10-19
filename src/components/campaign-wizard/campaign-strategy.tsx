import Link from "next/link";
import type { CampaignStrategyView } from "@/lib/campaign-strategy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-8 p-ds-24">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-h3">{value}</p>
      </CardContent>
    </Card>
  );
}

export function CampaignStrategySummary({
  campaignId,
  strategy,
  backHref,
}: {
  campaignId: number;
  strategy: CampaignStrategyView;
  backHref: string;
}) {
  return (
    <div className="flex flex-col gap-ds-32">
      <Card>
        <CardContent className="grid gap-ds-32 p-ds-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-ds-16">
            <div>
              <p className="text-caption text-muted-foreground">Estratégia recomendada</p>
              <p className="text-h2">{strategy.recommendedStrategy}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Confiança</p>
              <p className="text-h3">{strategy.confidence}</p>
            </div>
          </div>
          <div>
            <h2 className="text-h3">Motivos</h2>
            <ul className="mt-ds-16 flex flex-col gap-ds-12">
              {strategy.reasons.map((reason) => (
                <li key={reason} className="text-body">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="estrategia-leitura">
        <h2 id="estrategia-leitura" className="sr-only">
          Leitura da inteligência
        </h2>
        <div className="grid gap-ds-16 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryFact label="Consciência" value={strategy.buyerIntent} />
          <SummaryFact label="Sofisticação" value={strategy.competitionLevel} />
          <SummaryFact label="Claims proibidos" value={strategy.policyRisk} />
          <SummaryFact label="Estrutura recomendada" value={strategy.recommendedStructure} />
          <SummaryFact label="Ângulo" value={strategy.recommendedCta} />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href={backHref}>Voltar</Link>
        </Button>
        <Button asChild className="h-12 px-ds-24 sm:min-w-64">
          <Link href={`/admin/${campaignId}/gerando`}>Gerar Landing Page</Link>
        </Button>
      </div>
    </div>
  );
}
