"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { dayKey, scoreClass, type ValidationRow } from "@/app/admin/validation/validation-view";

const ALL = "todas";

export function ValidationBoard({ rows }: { rows: ValidationRow[] }) {
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState(ALL);
  const [product, setProduct] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [score, setScore] = useState(ALL);
  const [date, setDate] = useState("");

  const campaigns = useMemo(() => unique(rows.map((row) => row.campaign)), [rows]);
  const products = useMemo(() => unique(rows.map((row) => row.product)), [rows]);
  const visible = rows.filter((row) => matches(row, { query, campaign, product, status, score, date }));

  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <SearchInput label="Busca" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Campanha, produto ou marca" />
        <Select id="validation-campaign" label="Campanha" value={campaign} onValueChange={setCampaign} options={[{ value: ALL, label: "Todas" }, ...campaigns.map((item) => ({ value: item, label: item }))]} />
        <Select id="validation-product" label="Produto" value={product} onValueChange={setProduct} options={[{ value: ALL, label: "Todos" }, ...products.map((item) => ({ value: item, label: item }))]} />
        <Select
          id="validation-status"
          label="Status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: ALL, label: "Todos" },
            { value: "pronta", label: "Pronta" },
            { value: "revisao", label: "Revisão necessária" },
            { value: "falha", label: "Falha" },
          ]}
        />
        <Select
          id="validation-score"
          label="Pontuação"
          value={score}
          onValueChange={setScore}
          options={[
            { value: ALL, label: "Todas" },
            { value: "alta", label: "80 ou mais" },
            { value: "media", label: "50 a 79" },
            { value: "baixa", label: "Abaixo de 50" },
            { value: "sem", label: "Sem pontuação" },
          ]}
        />
        <div>
          <Label htmlFor="validation-date">Data</Label>
          <Input id="validation-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">Mostrando {visible.length} de {rows.length}</p>
      {visible.length === 0 ? (
        <EmptyState title="Nenhuma validação encontrada" description="Nenhuma validação corresponde a estes filtros." icon="search" />
      ) : (
        <ul className="flex flex-col gap-ds-12">
          {visible.map((row) => (
            <li key={row.key}>
              <Card>
                <CardContent>
                  <div className="flex flex-col gap-ds-12 lg:flex-row lg:items-start lg:justify-between">
                    <dl className="grid flex-1 gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="Data" value={row.dateLabel} />
                      <Field label="Campanha" value={row.campaign} />
                      <Field label="Produto" value={row.product} />
                      <Field label="Marca" value={row.brand} />
                      <div>
                        <dt className="text-caption text-muted-foreground">Pontuação</dt>
                        <dd className={`text-h3 ${scoreClass(row.policyTone)}`}>{row.score}</dd>
                      </div>
                      <Field label="Publicação" value={row.publication} />
                      <div>
                        <dt className="text-caption text-muted-foreground">Política</dt>
                        <dd className="mt-ds-4"><Badge tone={row.policyTone}>{row.policy}</Badge></dd>
                      </div>
                      <Field label="Recomendação" value={row.recommendation} />
                      <Field label="Última validação" value={row.dateLabel} />
                    </dl>
                    <Button asChild>
                      <Link href={row.href}>Abrir</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value && value !== "Não associada" && value !== "Nenhum produto"))].sort((left, right) => left.localeCompare(right, "pt"));
}

function matches(
  row: ValidationRow,
  filters: { query: string; campaign: string; product: string; status: string; score: string; date: string },
) {
  const needle = filters.query.trim().toLocaleLowerCase("pt");
  if (needle) {
    const haystack = `${row.campaign} ${row.product} ${row.brand} ${row.recommendation}`.toLocaleLowerCase("pt");
    if (!haystack.includes(needle)) return false;
  }
  if (filters.campaign !== ALL && row.campaign !== filters.campaign) return false;
  if (filters.product !== ALL && row.product !== filters.product) return false;
  if (filters.status === "pronta" && row.policy !== "Pronta") return false;
  if (filters.status === "revisao" && row.policy !== "Revisão necessária") return false;
  if (filters.status === "falha" && row.policy !== "Falha") return false;
  if (filters.date && dayKey(row.date) !== filters.date) return false;
  const numeric = Number(row.score);
  const hasScore = row.score !== "—" && Number.isFinite(numeric);
  if (filters.score === "sem" && hasScore) return false;
  if (filters.score === "alta" && (!hasScore || numeric < 80)) return false;
  if (filters.score === "media" && (!hasScore || numeric < 50 || numeric > 79)) return false;
  if (filters.score === "baixa" && (!hasScore || numeric >= 50)) return false;
  return true;
}
