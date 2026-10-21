import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { evaluateCampaignQuality } from "@/lib/product-showcase/quality-campaign";
import type { CheckStatus, GateStatus } from "@/lib/product-showcase/quality-gate";

function gateTone(status: GateStatus | CheckStatus) {
  if (status === "PASS") return "success" as const;
  if (status === "FAIL") return "danger" as const;
  return "review" as const;
}

export function LpQualityPanel({ campaignId }: { campaignId: number }) {
  const report = evaluateCampaignQuality(campaignId);
  if (!report) return null;
  const problems = report.problems.slice(0, 8);
  return (
    <Card data-lp-quality-gate="1">
      <CardContent className="flex flex-col gap-ds-12">
        <div>
          <p className="text-caption text-muted-foreground">FINAL_QUALITY_STATUS</p>
          <p className="text-h1" aria-label={`FINAL_QUALITY_STATUS ${report.finalQualityStatus}`}><Badge tone={gateTone(report.finalQualityStatus)}>{report.finalQualityStatus}</Badge></p>
          <p className="text-body text-muted-foreground">Qualidade visual homologada. Revisão humana pendente permanece REVIEW. Não prevê conversão e não libera publicação nem anúncios.</p>
        </div>
        <dl className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-caption text-muted-foreground">AUTOMATED_SCORE</dt>
            <dd className="mt-ds-4 text-body" aria-label={`AUTOMATED_SCORE ${report.automatedScore} de 100`}>{report.automatedScore} / 100</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">VISUAL_REVIEW_STATUS</dt>
            <dd className="mt-ds-4"><Badge tone={report.visualReviewStatus === "ACCEPTED" ? "success" : report.visualReviewStatus === "REJECTED" ? "danger" : "review"}>{report.visualReviewStatus}</Badge></dd>
          </div>
          <Gate label="Technical Gate" status={report.technicalGate} />
          <Gate label="Quality Gate" status={report.qualityGate} />
          <Gate label="Compliance Gate" status={report.complianceGate} />
          <div>
            <dt className="text-caption text-muted-foreground">Commercial Readiness</dt>
            <dd className="mt-ds-4"><Badge tone={report.commercialReadiness === "SUFFICIENT" ? "success" : report.commercialReadiness === "INSUFFICIENT" ? "danger" : "review"}>{report.commercialReadiness}</Badge></dd>
          </div>
        </dl>
        <div>
          <p className="text-caption text-muted-foreground">Dimensões</p>
          <ul className="mt-ds-8 flex flex-col gap-ds-4 text-body">
            {report.dimensions.map((dimension) => (
              <li key={dimension.id} className="flex flex-wrap items-center justify-between gap-ds-8">
                <span>{dimension.label}</span>
                <span>{dimension.points}/{dimension.maxPoints} · {dimension.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Principais problemas</p>
          {problems.length === 0 ? <p className="text-body">Nenhum problema registrado.</p> : (
            <ul className="mt-ds-8 list-disc pl-ds-16 text-body">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Evidências</p>
          <ul className="mt-ds-8 flex flex-col gap-ds-4 text-body">
            {report.evidence.map((item) => (
              <li key={item.id}>{item.id}: {item.status} — {item.detail}</li>
            ))}
          </ul>
        </div>
        <p className="text-body">Revisão visual humana: {report.humanReview}. Template selecionado: {report.selectedTemplate ?? "nenhum"}.</p>
        <p className="text-caption text-muted-foreground">
          <Link href={`/admin/${campaignId}/edit?aba=validacao`} className="underline">Abrir a validação da campanha</Link>
        </p>
      </CardContent>
    </Card>
  );
}

function Gate({ label, status }: { label: string; status: GateStatus }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-ds-4"><Badge tone={gateTone(status)}>{status}</Badge></dd>
    </div>
  );
}
