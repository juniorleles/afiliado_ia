import Link from "next/link";
import type { BlockedFact } from "@/lib/blocked-landing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function BlockedLanding({
  percent,
  facts,
  factsHref,
  cancelHref,
}: {
  percent: number;
  facts: BlockedFact[];
  factsHref: string;
  cancelHref: string;
}) {
  return (
    <div className="flex flex-col gap-ds-32">
      <Card>
        <CardContent className="flex flex-col gap-ds-8 p-ds-24">
          <p className="text-caption text-muted-foreground">Completude do produto</p>
          <p className="text-h2">{percent}%</p>
          <div
            className="h-2 overflow-hidden rounded-ds-full bg-secondary"
            role="progressbar"
            aria-label="Completude do produto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="informacoes-ausentes" className="flex flex-col gap-ds-16">
        <h2 id="informacoes-ausentes" className="text-h3">Informações ausentes</h2>
        <ul className="grid gap-ds-16">
          {facts.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-col gap-ds-8 p-ds-24">
                  <p className="text-h3">
                    <span aria-hidden>{item.filled ? "✔" : "✖"}</span> {item.label}
                  </p>
                  {item.reason ? <p className="text-body text-muted-foreground">{item.reason}</p> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href={cancelHref}>Cancelar</Link>
        </Button>
        <Button asChild className="h-12 px-ds-24 sm:min-w-64">
          <Link href={factsHref}>Completar Fatos do Produto</Link>
        </Button>
      </div>
    </div>
  );
}
