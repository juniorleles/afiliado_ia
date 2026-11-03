import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { readGeneration } from "@/lib/lp-generator/store";
import { readCommercialReuse } from "@/lib/presell-quality/commercial-reuse";
import {
  offerImageAdminFilePath,
  offerImageApprovalEligibility,
  offerImageIsPublishable,
  offerImagePublicationBlockers,
  readOfferImageInventory,
  withOfferImageAuthDefaults,
} from "@/lib/presell-quality/offer-images";
import { DsTokenStyle } from "@/components/design-system/primitives";
import { OfferImageReviewBoard, type OfferImageReviewRow } from "./review-board";
import "@/app/design-system-lab.css";
import "./offer-images-review.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Revisão de imagens da oferta",
  robots: { index: false, follow: false },
};

function flashFrom(query: Record<string, string | string[] | undefined>): { tone: "ok" | "error"; text: string } | null {
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  if (read("error") === "empty") return { tone: "error", text: "Nenhuma imagem selecionada." };
  if (read("error") === "justification-required") {
    return { tone: "error", text: "Registre a evidência de autorização de uso. Origem VERIFIED não autoriza publicação." };
  }
  if (read("error") === "not-eligible") {
    return { tone: "error", text: "A imagem não é elegível para esta ação. Evidência VERIFIED não autoriza uso automaticamente." };
  }
  if (read("error") === "rights-holder-license-unproven") {
    return {
      tone: "error",
      text: "Publicação bloqueada: OPERATOR_APPROVED não comprova a licença do titular dos direitos.",
    };
  }
  if (read("error")) return { tone: "error", text: "Não foi possível atualizar a autorização desta imagem." };
  const approved = read("approved");
  const rejected = read("rejected");
  const attested = read("attested");
  const skipped = read("skipped");
  if (approved || rejected || attested) {
    return {
      tone: "ok",
      text: [
        attested ? `${attested} declaração(ões) OPERATOR_APPROVED registrada(s). Publicação permanece bloqueada sem licença do titular.` : "",
        approved ? `${approved} imagem(ns) aprovada(s) para publicação.` : "",
        rejected ? `${rejected} imagem(ns) rejeitada(s).` : "",
        skipped ? `${skipped} ignorada(s) por não serem elegíveis.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  return null;
}

function one(query: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function originParts(sourceUrl: string): { host: string; file: string } {
  try {
    const url = new URL(sourceUrl);
    return { host: url.host, file: decodeURIComponent(url.pathname.split("/").pop() || sourceUrl) };
  } catch {
    return { host: "origem local", file: sourceUrl.split(/[\\/]/).pop() || sourceUrl };
  }
}

export default async function OfferImageReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const record = readGeneration(id);
  if (!record?.campaignId) notFound();
  const inventory = readOfferImageInventory(record.campaignId);
  const packages = readCommercialReuse(record.campaignId)?.approvedPackages ?? [];
  const productName = record.input.productName || `Campanha ${record.campaignId}`;
  const rows: OfferImageReviewRow[] = (inventory?.assets ?? []).map((raw) => {
    const asset = withOfferImageAuthDefaults(raw);
    const origin = originParts(asset.sourceUrl);
    const eligibility = offerImageApprovalEligibility(asset);
    return {
      assetId: asset.assetId,
      productName,
      bottleCount: asset.bottleCount,
      sourceHost: origin.host,
      sourceFile: origin.file,
      sourceUrl: asset.sourceUrl,
      thumbSrc: offerImageAdminFilePath(record.id, asset.assetId),
      evidenceStatus: asset.evidenceStatus,
      usageAuthorization: asset.usageAuthorization,
      reviewStatus: asset.reviewStatus,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      eligible: eligibility.ok,
      eligibilityReasons: eligibility.reasons,
      publishable: offerImageIsPublishable(asset),
      publicationBlockers: offerImagePublicationBlockers(asset),
      operatorAttestation: asset.operatorAttestation ?? "NONE",
      operatorAttestedBy: asset.operatorAttestedBy ?? null,
      operatorAttestedAt: asset.operatorAttestedAt ?? null,
      operatorAttestationNote: asset.operatorAttestationNote ?? null,
      rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
      rightsHolderLicenseEvidence: asset.rightsHolderLicenseEvidence ?? null,
      history: asset.authorizationHistory ?? [],
      authorizedBy: asset.authorizedBy ?? null,
      authorizedAt: asset.authorizedAt ?? null,
      justification: asset.authorizationJustification ?? null,
      evidenceNote: asset.authorizationEvidenceNote ?? null,
      associationRationale: asset.associationRationale,
      exclusionReason: asset.exclusionReason,
      duplicateOf: asset.duplicateOf,
    };
  });

  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="offer-images">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · Imagens da oferta · {productName}</span>
        <Link href={`/admin/lab/lp-generator/${record.id}/preview?candidate=54BX`}>Voltar ao preview 54BX</Link>
        <Link href={`/admin/lab/lp-generator/${record.id}`}>Geração</Link>
      </div>
      <div className="ds-index">
        <h1>Imagens pendentes do produtor</h1>
        <p className="ds-muted">
          Campanha {record.campaignId} · geração {record.id}. Evidência de origem VERIFIED não autoriza uso.
          OPERATOR_APPROVED do operador não comprova a licença do titular. Imagens pending ou rejeitadas não entram na
          landing page.
        </p>
        {inventory?.affiliateProgramAudit ? (
          <p className="ds-caption" data-affiliate-audit="1">
            Restrição do programa de afiliados preservada: {inventory.affiliateProgramAudit.note}
          </p>
        ) : null}
        {!inventory ? <p className="oir-empty">Nenhum inventário de imagens da oferta está gravado ainda.</p> : null}
        {inventory ? (
          <OfferImageReviewBoard
            generationId={record.id}
            productName={productName}
            sourcePageUrl={inventory.sourcePageUrl}
            packages={packages.map((item) => item.quantity)}
            flash={flashFrom(query)}
            rows={rows}
            initialFilters={{
              authorization: one(query, "authorization") || "ALL",
              evidence: one(query, "evidence") || "ALL",
              review: one(query, "review") || "ALL",
              bottles: one(query, "bottles") || "ALL",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
