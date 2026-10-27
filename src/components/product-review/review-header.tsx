"use client";

import { Badge } from "@/components/ui/badge";
import { indicatorsFromResearch } from "@/lib/product-research/indicators";
import type { ProductResearchRun } from "@/lib/product-research/types";

export function ProductReviewHeader({
  productName,
  marketplace,
  campaignId,
  run,
}: {
  productName: string;
  marketplace: string;
  campaignId: number;
  run: ProductResearchRun | null;
}) {
  const indicators = indicatorsFromResearch(run);
  const facts = indicators.reviewCompletion;
  const images = indicators.assetApproval;
  return (
    <header className="rounded-ds-lg border border-border bg-card p-ds-24" data-review-header>
      <div className="flex flex-wrap items-start justify-between gap-ds-16">
        <div>
          <p className="text-caption text-muted-foreground">Campanha #{campaignId} · {marketplace}</p>
          <h1 className="text-h1">{productName}</h1>
        </div>
        <Badge tone="review">SANDBOX</Badge>
      </div>
      <dl className="mt-ds-16 grid gap-ds-16 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">Pesquisa</dt>
          <dd className="text-h3">{indicators.researchCoverage.percent}%</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Fatos revisados</dt>
          <dd className="text-h3">{facts.accepted}/{facts.total}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Imagens aprovadas</dt>
          <dd className="text-h3">{images.approved}/{images.total}</dd>
        </div>
      </dl>
      <p className="mt-ds-12 text-caption text-muted-foreground">
        Cobertura não é aprovação. Autorização comercial permanece bloqueada. Publication Ready não é exibido.
      </p>
    </header>
  );
}
