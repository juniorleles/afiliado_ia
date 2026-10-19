import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

const NOT_FOUND = "Não encontrado durante a pesquisa.";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-12">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

function Lines({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-body text-muted-foreground">{NOT_FOUND}</p>;
  return (
    <ul className="flex flex-col gap-ds-8">
      {items.map((item) => <li key={item} className="text-body">{item}</li>)}
    </ul>
  );
}

export function StrategyDecisionPanel({ decision }: { decision: StrategyDecision | null }) {
  if (!decision) return <p className="text-body text-muted-foreground">{NOT_FOUND}</p>;
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="decisao-estrategia" title="Estratégia escolhida">
          <p className="text-h2">{decision.recommendedApproach}</p>
          <p className="text-body text-muted-foreground">Confiança: {Math.round(decision.confidence * 100)}%.</p>
        </Block>
        <Block id="decisao-justificativas" title="Justificativas">
          <Lines items={decision.reasoning} />
        </Block>
        <Block id="decisao-publico" title="Público">
          <p className="text-body">{decision.targetAudience}</p>
          <p className="text-body">Consciência: {decision.awarenessStage}.</p>
          <p className="text-body">Sofisticação: {decision.marketSophistication}</p>
        </Block>
        <Block id="decisao-angulo" title="Ângulo">
          <p className="text-body">{decision.copyAngle}</p>
        </Block>
        <Block id="decisao-estrutura" title="Estrutura">
          <p className="text-body">{decision.landingStructure}</p>
          <p className="text-body">{decision.contentPriority}</p>
        </Block>
        <Block id="decisao-emocoes" title="Emoções">
          <Lines items={decision.emotionalDrivers} />
        </Block>
        <Block id="decisao-gatilhos" title="Gatilhos">
          <Lines items={decision.persuasionTriggers} />
        </Block>
        <Block id="decisao-objecoes" title="Objeções">
          <Lines items={decision.objectionsToAnswer} />
        </Block>
        <Block id="decisao-claims" title="Claims proibidos">
          <Lines items={decision.claimsToAvoid} />
        </Block>
        <Block id="decisao-seo" title="SEO">
          <p className="text-body">{decision.seoDirection}</p>
        </Block>
        <Block id="decisao-ads" title="Google Ads">
          <p className="text-body">{decision.adDirection}</p>
        </Block>
        <Block id="decisao-validacao" title="Validação">
          <p className="text-body">{decision.validationNotes}</p>
        </Block>
      </CardContent>
    </Card>
  );
}
