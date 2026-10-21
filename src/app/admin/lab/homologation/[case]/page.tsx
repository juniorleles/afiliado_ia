import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import { HOMOLOGATION_CASES, buildHomologationFixture, type HomologationCase } from "@/lib/product-showcase/homologation-fixtures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Synthetic homologation fixture",
  robots: { index: false, follow: false },
};

export default async function HomologationFixturePage({
  params,
}: {
  params: Promise<{ case: string }>;
}) {
  const { case: caseId } = await params;
  if (!HOMOLOGATION_CASES.includes(caseId as HomologationCase)) notFound();
  const fixture = buildHomologationFixture(caseId as HomologationCase);
  return (
    <div data-synthetic-fixture={fixture.id} data-fixture-label={fixture.label}>
      <ProductShowcasePremiumV1 model={fixture.model} labHref="/admin" showLabBar={false} ctaPreview />
    </div>
  );
}
