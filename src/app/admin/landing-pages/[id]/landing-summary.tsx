import { Card, CardContent } from "@/components/ui/card";

export function LandingSummary({
  status,
  language,
  version,
  strategy,
  product,
  generatedAt,
  score,
  googleAds,
  publication,
}: {
  status: string;
  language: string;
  version: string;
  strategy: string;
  product: string;
  generatedAt: string;
  score: string;
  googleAds: string;
  publication: string;
}) {
  const items = [
    ["Status", status],
    ["Idioma", language],
    ["Versão", version],
    ["Estratégia", strategy],
    ["Produto", product],
    ["Data de geração", generatedAt],
    ["Pontuação", score],
    ["Google Ads", googleAds],
    ["Publicação", publication],
  ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-16 p-ds-16">
        <h2 className="text-h3">Resumo</h2>
        <dl className="flex flex-col gap-ds-12">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="text-body">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
