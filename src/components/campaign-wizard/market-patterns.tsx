import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { MarketSourceClass } from "@/lib/market-research/types";

const NOT_FOUND = "Não encontrado durante a pesquisa.";
const CLASS_LABEL: Record<MarketSourceClass, string> = {
  BRAND: "Marca",
  SELLER: "Vendedor",
  RETAILER: "Varejista",
  EDITORIAL: "Editorial",
  "FORUM/COMMUNITY": "Fórum",
  OTHER: "Outra",
  UNKNOWN: "Desconhecida",
};

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-16">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

function Missing() {
  return <p className="text-body text-muted-foreground">{NOT_FOUND}</p>;
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) return <Missing />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-body">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-border px-ds-12 py-ds-8 text-caption font-medium text-muted-foreground">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-border last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={`${columns[cellIndex]}-${index}`} className={cellIndex === 0 ? "max-w-xs px-ds-12 py-ds-12 align-top break-words" : "whitespace-nowrap px-ds-12 py-ds-12 align-top"}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MarketPatterns({ analysis }: { analysis: MarketIntelligenceAnalysis | null }) {
  if (!analysis) return <Missing />;
  const price = analysis.dominantPricing;
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="padroes-resumo" title="Resumo executivo">
          <p className="text-body">{analysis.marketSummary.narrative}</p>
          <p className="text-caption text-muted-foreground">Confiança da análise: {Math.round(analysis.confidence * 100)}%. Calculado sobre o relatório salvo.</p>
        </Block>

        <Block id="padroes-estrutura" title="Estrutura dominante">
          {analysis.dominantStructure.sections.length === 0 ? <Missing /> : (
            <>
              <p className="text-body">{analysis.dominantStructure.summary}</p>
              <DataTable
                columns={["Seção", "Páginas", "Percentual"]}
                rows={analysis.dominantStructure.sections.map((item) => [item.name, String(item.count), `${item.percent}%`])}
              />
            </>
          )}
        </Block>

        <Block id="padroes-headlines" title="Headlines dominantes">
          <DataTable
            columns={["Padrão", "Quantidade", "Percentual", "Exemplos"]}
            rows={analysis.dominantHeadlinePatterns.map((item) => [item.pattern, String(item.count), `${item.percent}%`, item.examples.join(" · ")])}
          />
        </Block>

        <Block id="padroes-cta" title="CTA dominante">
          {analysis.dominantCTA.text ? (
            <p className="text-body">{analysis.dominantCTA.text} · {analysis.dominantCTA.count} ocorrências · {analysis.dominantCTA.percent}%</p>
          ) : <Missing />}
        </Block>

        <Block id="padroes-beneficios" title="Benefícios dominantes">
          <DataTable
            columns={["Benefício", "Ocorrências", "Domínios"]}
            rows={analysis.dominantBenefits.map((item) => [item.label, String(item.count), item.domains.join(", ")])}
          />
        </Block>

        <Block id="padroes-faq" title="FAQ dominante">
          <DataTable
            columns={["Pergunta", "Quantidade", "Exemplos"]}
            rows={analysis.dominantFaq.map((item) => [item.label, String(item.count), item.examples.join(" · ")])}
          />
        </Block>

        <Block id="padroes-garantia" title="Garantia dominante">
          {analysis.dominantGuarantee.label ? (
            <p className="text-body">{analysis.dominantGuarantee.label} · {analysis.dominantGuarantee.count} ocorrências</p>
          ) : <Missing />}
        </Block>

        <Block id="padroes-preco" title="Preço predominante">
          {price.count > 0 && price.currency && price.minimum !== null && price.maximum !== null && price.average !== null && price.predominant !== null ? (
            <>
              <p className="text-body">
                Mínimo {money(price.minimum, price.currency)}. Máximo {money(price.maximum, price.currency)}. Médio {money(price.average, price.currency)}. Predominante {money(price.predominant, price.currency)}. {price.count} preços numéricos.
              </p>
              {price.maximum > price.minimum * 3 ? <p className="text-caption text-muted-foreground">A distância entre o menor e o maior valor é grande, então a média não descreve uma única oferta.</p> : null}
            </>
          ) : <Missing />}
          <p className="text-caption text-muted-foreground">Valores lidos nas páginas. Não são o preço do produto.</p>
        </Block>

        <Block id="padroes-concorrentes" title="Concorrentes">
          <DataTable
            columns={["Domínio", "Classe", "Páginas"]}
            rows={analysis.competitorsRank.map((item) => [item.domain, CLASS_LABEL[item.classification], String(item.pages)])}
          />
        </Block>

        <Block id="padroes-oportunidades" title="Oportunidades">
          <DataTable
            columns={["Motivo", "Quantidade", "Confiança"]}
            rows={analysis.opportunities.map((item) => [item.reason, String(item.count), `${Math.round(item.confidence * 100)}%`])}
          />
        </Block>

        <Block id="padroes-riscos" title="Riscos Google Ads">
          <DataTable
            columns={["Claim", "Nível", "Quantidade"]}
            rows={analysis.dominantPolicyRisks.map((item) => [item.claim, item.level, String(item.count)])}
          />
        </Block>
      </CardContent>
    </Card>
  );
}
