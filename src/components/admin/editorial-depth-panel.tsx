import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { evaluateEditorialIntelligence } from "@/lib/product-showcase/editorial-campaign";
import type { EditorialDepth, EditorialRecord } from "@/lib/product-showcase/editorial-intelligence";

function tone(depth: EditorialDepth) {
  if (depth === "RICH" || depth === "ADEQUATE") return "success" as const;
  if (depth === "LIMITED") return "review" as const;
  return "danger" as const;
}

function List({ title, items }: { title: string; items: EditorialRecord[] }) {
  const shown = items.slice(0, 8);
  return (
    <div>
      <p className="text-caption text-muted-foreground">{title}</p>
      {shown.length === 0 ? <p className="text-body">Nenhum registro.</p> : (
        <ul className="mt-ds-8 list-disc pl-ds-16 text-body">
          {shown.map((item) => (
            <li key={`${item.disposition}:${item.topic}:${item.text}`}>
              <span className="text-caption text-muted-foreground">{item.disposition}</span> {item.text} — {item.reason}
            </li>
          ))}
        </ul>
      )}
      {items.length > shown.length ? <p className="text-caption text-muted-foreground">+{items.length - shown.length} registros.</p> : null}
    </div>
  );
}

export function EditorialDepthPanel({ campaignId }: { campaignId: number }) {
  const report = evaluateEditorialIntelligence(campaignId);
  if (!report) return null;
  return (
    <Card data-editorial-depth="1">
      <CardContent className="flex flex-col gap-ds-12">
        <div>
          <p className="text-caption text-muted-foreground">Profundidade editorial</p>
          <p className="text-h1"><Badge tone={tone(report.depth)}>{report.depth}</Badge></p>
          <p className="text-body text-muted-foreground">Diagnóstico interno. Não aparece na landing pública e não libera publicação.</p>
        </div>
        <List title="Informações utilizadas" items={report.used} />
        <List title="Informações descartadas" items={report.discarded} />
        <List title="Lacunas de pesquisa" items={report.gaps} />
        <div>
          <p className="text-caption text-muted-foreground">Motivos de insuficiência</p>
          {report.insufficiency.length === 0 ? <p className="text-body">Nenhum. A profundidade não depende de benefício médico.</p> : (
            <ul className="mt-ds-8 list-disc pl-ds-16 text-body">
              {report.insufficiency.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
