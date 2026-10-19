import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { LandingBlueprint, SectionStatus } from "@/lib/landing-blueprint/types";
import type { GeneratedSections, SectionGeneration } from "@/lib/section-generation/types";

const STATUS_LABEL: Record<SectionStatus, string> = {
  PENDING: "Pendente",
  READY: "Pronta",
  GENERATING: "Gerando",
  GENERATED: "Gerada",
  VALIDATED: "Validada",
  FAILED: "Falhou",
};

const SOURCE_LABEL = {
  ProductFacts: "Fatos do produto",
  MarketResearchReport: "Pesquisa de mercado",
  MarketIntelligenceAnalysis: "Inteligência de mercado",
  StrategyDecision: "Decisão de estratégia",
} as const;

const SECTION_LABEL: Record<string, string> = {
  hero: "Hero",
  problem: "Problema",
  agitation: "Aprofundamento",
  solution: "Solução",
  benefits: "Benefícios",
  ingredients: "Ingredientes",
  "scientific-evidence": "Evidência científica",
  testimonials: "Depoimentos",
  comparison: "Comparação",
  faq: "FAQ",
  guarantee: "Garantia",
  cta: "CTA",
  footer: "Rodapé",
  seo: "SEO",
  schema: "Schema",
};

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-12">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

const GENERATION_LABEL = {
  GENERATED: "Gerada",
  FAILED: "Falhou",
} as const;

function generationFor(sections: GeneratedSections | null, id: string): SectionGeneration | undefined {
  return sections?.sections.find((section) => section.sectionId === id);
}

function score(section: SectionGeneration | undefined, key: "copyScore" | "readability" | "evidenceScore" | "complianceScore" | "persuasionScore"): string {
  const value = section?.scores?.[key];
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

function evidenceLabel(section: SectionGeneration): string {
  if (section.evidenceUsed.length === 0) return "Nenhuma evidência";
  const origins = [...new Set(section.evidenceUsed.map((item) => SOURCE_LABEL[item.origin]))];
  return `${origins.join(", ")} · ${section.evidenceUsed.length}`;
}

export function LandingBlueprintPanel({ blueprint, generated }: { blueprint: LandingBlueprint | null; generated: GeneratedSections | null }) {
  if (!blueprint) return <p className="text-body text-muted-foreground">Não encontrado durante a pesquisa.</p>;
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="blueprint-resumo" title="Planta da landing">
          <p className="text-body">
            {blueprint.strategy.recommendedApproach ?? "Sem decisão"} · confiança {blueprint.strategy.confidence === null ? "não medida" : `${Math.round(blueprint.strategy.confidence * 100)}%`} · idioma {blueprint.language}
          </p>
          <p className="text-caption text-muted-foreground">
            Versão {blueprint.blueprintVersion}. {blueprint.validation.readySections} seções prontas e {blueprint.validation.pendingSections} pendentes.
            {generated ? ` Geração média ${generated.averageGenerationTimeMs} ms.` : " A geração individual ainda não foi salva."}
          </p>
        </Block>
        <Block id="blueprint-secoes" title="Seções">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-body">
              <thead>
                <tr>
                  {["Seção", "Planta", "Geração", "Copy", "Leitura", "Evidência", "Compliance", "Persuasão", "Tempo", "Evidências"].map((column) => (
                    <th key={column} className="border-b border-border px-ds-12 py-ds-8 text-caption font-medium text-muted-foreground">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blueprint.sections.map((section) => {
                  const generation = generationFor(generated, section.id);
                  return (
                    <tr key={section.id} className="border-b border-border last:border-b-0">
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{SECTION_LABEL[section.id] ?? section.id}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{STATUS_LABEL[section.generationStatus]}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{generation ? GENERATION_LABEL[generation.status] : "Pendente"}{generation?.cached ? " · cache" : ""}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{score(generation, "copyScore")}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{score(generation, "readability")}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{score(generation, "evidenceScore")}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{score(generation, "complianceScore")}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{score(generation, "persuasionScore")}</td>
                      <td className="whitespace-nowrap px-ds-12 py-ds-12 align-top">{generation ? `${generation.generationTime} ms` : "—"}</td>
                      <td className="px-ds-12 py-ds-12 align-top">{generation ? evidenceLabel(generation) : "Não encontrado durante a pesquisa."}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Block>
      </CardContent>
    </Card>
  );
}
