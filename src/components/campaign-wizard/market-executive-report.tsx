"use client";

import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ExecutiveCount,
  ExecutiveEvidenceRow,
  ExecutiveReport,
  ExecutiveSource,
} from "@/lib/market-research/executive-report";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-16">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: string }) {
  return <p className="text-body text-muted-foreground">{children}</p>;
}

function Mark({ domain }: { domain: string }) {
  const letter = (domain.replace(/^www\./i, "")[0] || "?").toUpperCase();
  return (
    <span aria-hidden className="inline-flex h-ds-24 w-ds-24 shrink-0 items-center justify-center rounded-ds-sm bg-secondary text-caption font-semibold text-secondary-foreground">
      {letter}
    </span>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
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
                <td key={`${columns[cellIndex]}-${index}`} className="max-w-xs px-ds-12 py-ds-12 align-top break-words">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DomainCell({ domain }: { domain: string }) {
  return (
    <span className="inline-flex items-center gap-ds-8 whitespace-nowrap">
      <Mark domain={domain} />
      <span className="break-all">{domain}</span>
    </span>
  );
}

function EvidenceTable({ rows }: { rows: ExecutiveEvidenceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-body">
        <thead>
          <tr>
            {["Trecho", "Fonte", "Domínio", "Quantidade"].map((column) => (
              <th key={column} className="border-b border-border px-ds-12 py-ds-8 text-caption font-medium text-muted-foreground">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.domain}-${row.text.slice(0, 48)}`} className="border-b border-border last:border-b-0">
              <td className="max-w-xs px-ds-12 py-ds-12 align-top break-words">{row.text}</td>
              <td className="max-w-xs px-ds-12 py-ds-12 align-top break-words">{row.source}</td>
              <td className="px-ds-12 py-ds-12 align-top"><DomainCell domain={row.domain} /></td>
              <td className="px-ds-12 py-ds-12 align-top">{row.occurrences}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-16 p-ds-24">{children}</CardContent>
    </Card>
  );
}

function CountList({ rows }: { rows: ExecutiveCount[] }) {
  if (rows.length === 0) return null;
  return <DataTable columns={["Texto", "Posição", "Frequência"]} rows={rows.map((row) => [row.label, row.position, row.count])} />;
}

function SourceTable({ rows, pagesLabel }: { rows: ExecutiveSource[]; pagesLabel: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-body">
        <thead>
          <tr>
            {["Domínio", "Tipo", "Classificação", pagesLabel].map((column) => (
              <th key={column} className="border-b border-border px-ds-12 py-ds-8 text-caption font-medium text-muted-foreground">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.domain} className="border-b border-border last:border-b-0">
              <td className="px-ds-12 py-ds-12 align-top"><DomainCell domain={row.domain} /></td>
              <td className="px-ds-12 py-ds-12 align-top">{row.type}</td>
              <td className="px-ds-12 py-ds-12 align-top">{row.classification}</td>
              <td className="px-ds-12 py-ds-12 align-top">{row.pages}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarketExecutiveReport({ report }: { report: ExecutiveReport }) {
  const technical = report.technical;
  return (
    <div className="flex flex-col gap-ds-32">
      <Block id="resumo-executivo" title="Resumo executivo">
        <Panel>
          {report.summary.map((paragraph) => <p key={paragraph} className="text-body">{paragraph}</p>)}
        </Panel>
      </Block>

      <Block id="concorrentes" title="Concorrentes">
        <Panel>
          {report.competitors.length === 0 ? <Note>Nenhum domínio utilizável fora de marca ou fonte desconhecida.</Note> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-body">
                <thead>
                  <tr>
                    {["Nome", "Tipo", "Domínio", "Classificação", "Utilizado"].map((column) => (
                      <th key={column} className="border-b border-border px-ds-12 py-ds-8 text-caption font-medium text-muted-foreground">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.competitors.map((row) => (
                    <tr key={row.domain} className="border-b border-border last:border-b-0">
                      <td className="px-ds-12 py-ds-12 align-top">{row.name}</td>
                      <td className="px-ds-12 py-ds-12 align-top">{row.type}</td>
                      <td className="px-ds-12 py-ds-12 align-top"><DomainCell domain={row.domain} /></td>
                      <td className="px-ds-12 py-ds-12 align-top">{row.classification}</td>
                      <td className="px-ds-12 py-ds-12 align-top">{row.used}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Block>

      <Block id="beneficios-encontrados" title="Benefícios encontrados">
        <Panel>
          <Note>{report.benefitsNote}</Note>
          <EvidenceTable rows={report.benefits} />
        </Panel>
      </Block>

      <Block id="ingredientes" title="Ingredientes">
        <Panel>
          <Note>{report.ingredientsNote}</Note>
          <EvidenceTable rows={report.ingredients} />
        </Panel>
      </Block>

      <Block id="objecoes-encontradas" title="Objeções encontradas">
        <Panel>
          <Note>{report.objectionsNote}</Note>
          {report.objections.length === 0 ? <Note>Nenhuma objeção foi registrada nos trechos.</Note> : <EvidenceTable rows={report.objections} />}
        </Panel>
      </Block>

      <Block id="headlines" title="Headlines dos concorrentes">
        <Panel>
          {report.headlines.length === 0 ? <Note>Nenhum título foi guardado nas fontes.</Note> : (
            <DataTable columns={["Headline", "Domínio", "Tipo"]} rows={report.headlines.map((row) => [row.headline, row.domain, row.type])} />
          )}
        </Panel>
      </Block>

      <Block id="ctas" title="CTA dos concorrentes">
        <Panel>
          <Note>{report.ctasNote}</Note>
          <CountList rows={report.ctas} />
        </Panel>
      </Block>

      <Block id="estruturas" title="Estruturas de landing">
        <Panel>
          <Note>{report.structuresNote}</Note>
          {report.structures.length > 0 ? <DataTable columns={["Estrutura", "Frequência"]} rows={report.structures.map((row) => [row.structure, row.frequency])} /> : null}
        </Panel>
      </Block>

      <Block id="palavras-chave" title="Palavras-chave">
        <Panel>
          <Note>{report.keywordsNote}</Note>
          {report.keywords.length === 0
            ? <Note>Nenhum termo se repetiu o bastante para entrar no relatório.</Note>
            : <DataTable columns={["Palavra", "Volume relativo", "Origem"]} rows={report.keywords.map((row) => [row.keyword, row.volume, row.origin])} />}
        </Panel>
      </Block>

      <Block id="precos" title="Preços">
        <Panel>
          <Note>{report.pricesNote}</Note>
          {report.prices.length > 0 ? <DataTable columns={["Produto", "Preço", "Fonte", "Domínio"]} rows={report.prices.map((row) => [row.product, row.price, row.source, row.domain])} /> : null}
        </Panel>
      </Block>

      <Block id="garantias" title="Garantias">
        <Panel>
          <Note>{report.guaranteesNote}</Note>
          <EvidenceTable rows={report.guarantees} />
        </Panel>
      </Block>

      <Block id="claims" title="Claims">
        <Panel>
          <Note>{report.claimsNote}</Note>
          <EvidenceTable rows={report.claims} />
        </Panel>
      </Block>

      <Block id="faq" title="FAQ">
        <Panel>
          <Note>{report.faqNote}</Note>
          {report.faqs.length > 0 ? <DataTable columns={["Pergunta", "Resposta", "Domínio"]} rows={report.faqs.map((row) => [row.question, row.answer, row.domain])} /> : null}
        </Panel>
      </Block>

      <Block id="evidencias" title="Evidências científicas">
        <Panel>
          <Note>{report.scientificNote}</Note>
          {report.scientific.length > 0 ? (
            <DataTable
              columns={["Ingrediente", "Tipo", "Fonte", "Domínio"]}
              rows={report.scientific.map((row) => [row.ingredient, row.type, row.source, row.domain])}
            />
          ) : null}
        </Panel>
      </Block>

      <Block id="riscos" title="Riscos Google Ads">
        <Panel>
          <Note>{report.risksNote}</Note>
          {report.risks.length > 0 ? (
            <DataTable
              columns={["Termo", "Origem", "Fonte", "Domínio", "Risco"]}
              rows={report.risks.map((row) => [row.claim, row.origin, row.source, row.domain, row.risk])}
            />
          ) : null}
        </Panel>
      </Block>

      <Block id="oportunidades" title="Oportunidades">
        <Panel>
          <ul className="flex flex-col gap-ds-8">
            {report.opportunities.map((item) => <li key={item} className="text-body">{item}</li>)}
          </ul>
        </Panel>
      </Block>

      <Block id="publico" title="Público identificado">
        <Panel>
          <dl className="grid gap-ds-16 sm:grid-cols-2">
            {[
              ["Homens", report.audience.men],
              ["Mulheres", report.audience.women],
              ["Faixa etária", report.audience.age],
              ["Principais dores", report.audience.pains],
              ["Objetivos", report.audience.goals],
              ["Persona", report.audience.personas],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-body">{value}</dd>
              </div>
            ))}
          </dl>
          {report.audience.questions.length > 0 ? (
            <div>
              <p className="text-caption text-muted-foreground">Dúvidas encontradas nos trechos</p>
              <ul className="mt-ds-8 flex flex-col gap-ds-8">
                {report.audience.questions.map((item) => <li key={item} className="text-body">{item}</li>)}
              </ul>
            </div>
          ) : <Note>O relatório não identifica sexo, idade, dores nem objetivos do público.</Note>}
        </Panel>
      </Block>

      <Block id="fontes-analisadas" title="Fontes analisadas">
        <Panel>
          <Note>{report.sourcesNote}</Note>
          {report.sources.length === 0 ? <Note>Nenhuma fonte encontrada.</Note> : <SourceTable rows={report.sources} pagesLabel="Páginas utilizadas" />}
        </Panel>
      </Block>

      <section aria-labelledby="detalhes-tecnicos">
        <Accordion type="single" collapsible>
          <AccordionItem value="detalhes">
            <AccordionTrigger id="detalhes-tecnicos">Detalhes técnicos</AccordionTrigger>
            <AccordionContent className="text-foreground">
              <dl className="grid gap-ds-16 sm:grid-cols-2">
                {[
                  ["Qualidade", technical.quality],
                  ["Confiança", technical.confidence],
                  ["Validade", technical.validity],
                  ["Provider", technical.provider],
                  ["Tempo", technical.duration],
                  ["Páginas abertas", technical.pages],
                  ["Tempo médio por página", technical.averagePage],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-caption text-muted-foreground">{label}</dt>
                    <dd className="text-body break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-ds-16">
                <p className="text-caption text-muted-foreground">Consultas</p>
                <ul className="mt-ds-8 flex flex-col gap-ds-4">
                  {technical.queries.map((query) => <li key={query} className="text-body">{query}</li>)}
                </ul>
              </div>
              <p className="mt-ds-16 text-body">Classes: {technical.classes.join(", ") || "Nenhuma"}</p>
              <p className="text-body">Famílias: {technical.families.join(", ") || "Nenhuma"}</p>
              <p className="text-body break-words">Hosts: {technical.hosts.join(", ") || "Nenhum"}</p>
              <pre className="mt-ds-16 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-ds-md bg-secondary p-ds-16 text-caption text-secondary-foreground">{technical.json}</pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}
