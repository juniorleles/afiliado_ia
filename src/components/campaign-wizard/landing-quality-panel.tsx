import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { AutoFixHistory, LandingQuality } from "@/lib/landing-quality/types";

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

const STOP: Record<LandingQuality["stoppedBecause"], string> = {
  overall: "A pontuação geral chegou a 90.",
  attempts: "Uma seção chegou ao máximo de 3 tentativas.",
  evidence: "A pontuação restante depende da evidência salva.",
};

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-12">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

function nameOf(id: string): string {
  return LABEL[id] ?? id;
}

export function LandingQualityPanel({ quality, history }: { quality: LandingQuality | null; history: AutoFixHistory | null }) {
  if (!quality) return <p className="text-body text-muted-foreground">Não encontrado durante a pesquisa.</p>;
  const corrections = history?.entries.filter((entry) => entry.changed) ?? [];
  const entries = history?.entries ?? [];
  const scores = [
    ["Copy", quality.score.copy],
    ["SEO", quality.score.seo],
    ["Evidência", quality.score.evidence],
    ["Compliance", quality.score.compliance],
    ["Persuasão", quality.score.persuasion],
    ["Leitura", quality.score.readability],
    ["Confiança", quality.score.trust],
    ["Geral", quality.score.overall],
  ] as const;
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="qualidade-pontuacao" title="Pontuação">
          <p className="text-body">Landing final validada. {STOP[quality.stoppedBecause]}</p>
          <p className="text-caption text-muted-foreground">
            Geral é a média editorial de Copy, SEO, Evidência, Compliance, Persuasão e Leitura. Nota abaixo de 90 não é, sozinha, uma violação de segurança. Publicação continua bloqueada.
          </p>
          <dl className="grid grid-cols-2 gap-ds-16 sm:grid-cols-4">
            {scores.map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-h3">{value}</dd>
              </div>
            ))}
          </dl>
        </Block>
        <Block id="qualidade-tempo" title="Tempo">
          <p className="text-body">Validação em {quality.durationMs} ms.</p>
        </Block>
        <Block id="qualidade-problemas" title="Problemas">
          {quality.problems.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhum problema na landing final.</p>
          ) : (
            <ul className="flex flex-col gap-ds-8">
              {quality.problems.map((item, index) => (
                <li key={`${item.code}-${item.sectionId}-${index}`} className="text-body">
                  {nameOf(item.sectionId)} · {item.message}
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block id="qualidade-correcoes" title="Correções">
          {corrections.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhuma seção precisou ser reescrita.</p>
          ) : (
            <ul className="flex flex-col gap-ds-8">
              {corrections.map((entry, index) => (
                <li key={`${entry.sectionId}-${entry.attempt}-${index}`} className="text-body">
                  {entry.note} · {entry.durationMs} ms
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block id="qualidade-historico" title="Histórico">
          {entries.length === 0 ? (
            <p className="text-body text-muted-foreground">Nenhuma tentativa registrada.</p>
          ) : (
            <ul className="flex flex-col gap-ds-8">
              {entries.map((entry, index) => (
                <li key={`${entry.at}-${entry.sectionId}-${index}`} className="text-body">
                  Tentativa {entry.attempt} · {nameOf(entry.sectionId)} · {entry.changed ? "reescrita" : "mantida"} · {entry.durationMs} ms
                </li>
              ))}
            </ul>
          )}
        </Block>
      </CardContent>
    </Card>
  );
}
