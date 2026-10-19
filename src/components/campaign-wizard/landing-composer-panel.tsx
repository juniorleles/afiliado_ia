import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { LandingDocument } from "@/lib/landing-composer/types";

const LABEL: Record<string, string> = {
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

function tree(document: LandingDocument): string {
  const rows = [
    ...document.sections.map((section) => LABEL[section.sectionId] ?? section.sectionId),
    ...(document.seo ? ["SEO"] : []),
    ...(document.schema ? ["Schema"] : []),
  ];
  if (rows.length === 0) return "Landing";
  return ["Landing", ...rows.map((label, index) => `${index === rows.length - 1 ? "└──" : "├──"} ${label}`)].join("\n");
}

export function LandingComposerPanel({ document }: { document: LandingDocument | null }) {
  if (!document) return <p className="text-body text-muted-foreground">Não encontrado durante a pesquisa.</p>;
  const structure = document.validationStatus === "PASS" ? "Estrutura válida" : "Estrutura incompleta";
  const render = document.renderStatus === "READY" ? "Pronta para render" : "Render incompleto";
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="composer-resumo" title="Landing Composer">
          <p className="text-body">
            {document.sections.length} seções no corpo · {structure} · {render}
            {document.metadata.cached ? " · cache" : ""}
          </p>
          <p className="text-caption text-muted-foreground">
            Composição em {document.metadata.compositionTimeMs} ms · idioma {document.language}
            {document.metadata.approachId ? ` · ${document.metadata.approachId}` : ""}
          </p>
        </Block>
        <Block id="composer-arvore" title="Árvore">
          <pre className="overflow-x-auto whitespace-pre text-body">{tree(document)}</pre>
        </Block>
        <Block id="composer-avisos" title="Avisos">
          {document.warnings.length === 0 && document.errors.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhum aviso.</p>
          ) : (
            <ul className="flex flex-col gap-ds-8">
              {document.errors.map((item) => <li key={item} className="text-body">{item}</li>)}
              {document.warnings.map((item) => <li key={item} className="text-body">{item}</li>)}
            </ul>
          )}
        </Block>
      </CardContent>
    </Card>
  );
}
