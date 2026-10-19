import { Card, CardContent } from "@/components/ui/card";
import type { LandingGenerationRecord } from "@/lib/landing-generation-history";

function parts(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: "Não informada", time: "Não informada" };
  const zone = "America/Sao_Paulo";
  return {
    date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: zone }).format(parsed),
    time: new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: zone }).format(parsed),
  };
}

function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "Não informado";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  const digits = seconds < 10 ? 1 : 0;
  return `${seconds.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
}

export function GenerationHistory({ records }: { records: LandingGenerationRecord[] }) {
  return (
    <section className="flex flex-col gap-ds-16" aria-label="Histórico da geração">
      <h2 className="text-h2">Histórico da geração</h2>
      {records.length === 0 ? (
        <Card>
          <CardContent className="p-ds-24">
            <p className="text-body text-muted-foreground">Nenhuma geração registrada.</p>
          </CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-ds-16">
          {records.map((record) => {
            const when = parts(record.createdAt);
            const success = record.result === "success";
            const fields = [
              ["Data", when.date],
              ["Hora", when.time],
              ["Estratégia", record.strategy],
              ["Idioma", record.language],
              ["Modelo utilizado", record.model],
              ["Tempo de geração", durationLabel(record.durationMs)],
              ["Resultado", success ? "Sucesso" : "Erro"],
              ["Erro", success ? "Nenhum" : record.error?.trim() || "Não informado"],
            ];
            return (
              <li key={record.id}>
                <Card>
                  <CardContent className="p-ds-24">
                    <dl className="grid gap-ds-16 sm:grid-cols-2">
                      {fields.map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-caption text-muted-foreground">{label}</dt>
                          <dd className={label === "Resultado" ? (success ? "text-body text-success" : "text-body text-danger") : "text-body"}>
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
