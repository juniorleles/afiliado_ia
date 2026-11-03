"use client";

import React, { useEffect, useMemo, useState } from "react";
import { batchEligibleOfferImagesAction, decideOfferImageAction } from "./actions";
import type { OfferImageAuthorizationEvent } from "@/lib/presell-quality/offer-images";

export type OfferImageReviewRow = {
  assetId: string;
  productName: string;
  bottleCount: number | null;
  sourceHost: string;
  sourceFile: string;
  sourceUrl: string;
  thumbSrc: string;
  evidenceStatus: "VERIFIED" | "INSUFFICIENT" | "REJECTED";
  usageAuthorization: "APPROVED" | "PENDING" | "REJECTED";
  reviewStatus: "APPROVED" | "REQUIRES_HUMAN_REVIEW" | "REJECTED";
  mimeType: string | null;
  width: number;
  height: number;
  sha256: string | null;
  eligible: boolean;
  eligibilityReasons: string[];
  publishable: boolean;
  publicationBlockers: string[];
  operatorAttestation: "NONE" | "OPERATOR_APPROVED" | "OPERATOR_REJECTED";
  operatorAttestedBy: string | null;
  operatorAttestedAt: string | null;
  operatorAttestationNote: string | null;
  rightsHolderLicenseStatus: "UNPROVEN" | "PROVEN" | "DENIED";
  rightsHolderLicenseEvidence: string | null;
  history: OfferImageAuthorizationEvent[];
  authorizedBy: string | null;
  authorizedAt: string | null;
  justification: string | null;
  evidenceNote: string | null;
  associationRationale: string[];
  exclusionReason: string | null;
  duplicateOf: string | null;
};

const AUTHORIZATION_OPTIONS = [
  { value: "ALL", label: "Todas as autorizações" },
  { value: "PENDING", label: "PENDING" },
  { value: "APPROVED", label: "APPROVED" },
  { value: "REJECTED", label: "REJECTED" },
];

const EVIDENCE_OPTIONS = [
  { value: "ALL", label: "Todas as evidências" },
  { value: "VERIFIED", label: "VERIFIED" },
  { value: "INSUFFICIENT", label: "INSUFFICIENT" },
  { value: "REJECTED", label: "REJECTED" },
];

const REVIEW_OPTIONS = [
  { value: "ALL", label: "Todas as revisões" },
  { value: "REQUIRES_HUMAN_REVIEW", label: "REQUIRES_HUMAN_REVIEW" },
  { value: "APPROVED", label: "APPROVED" },
  { value: "REJECTED", label: "REJECTED" },
];

function badgeClass(status: string): string {
  if (status === "OPERATOR_APPROVED") return "oir-badge oir-badge--info";
  if (status === "APPROVED" || status === "VERIFIED" || status === "PROVEN") return "oir-badge oir-badge--success";
  if (
    status === "PENDING" ||
    status === "INSUFFICIENT" ||
    status === "REQUIRES_HUMAN_REVIEW" ||
    status === "UNPROVEN" ||
    status === "NONE"
  ) {
    return "oir-badge oir-badge--warning";
  }
  return "oir-badge oir-badge--danger";
}

function originLabel(row: OfferImageReviewRow): string {
  return [row.sourceHost, row.sourceFile].filter(Boolean).join(" / ");
}

function quantityLabel(count: number | null): string {
  return count == null ? "Sem associação" : `${count} frasco${count === 1 ? "" : "s"}`;
}

function copyAuthorizationFields(form: HTMLFormElement | null) {
  const justification = document.querySelector<HTMLTextAreaElement>("[data-justification]");
  const note = document.querySelector<HTMLTextAreaElement>("[data-evidence-note]");
  if (!form) return;
  const justificationInput = form.querySelector<HTMLInputElement>('input[name="justification"]');
  const evidenceInput = form.querySelector<HTMLInputElement>('input[name="evidenceNote"]');
  if (justificationInput) justificationInput.value = justification?.value ?? "";
  if (evidenceInput) evidenceInput.value = note?.value ?? "";
}

export function OfferImageReviewBoard({
  generationId,
  productName,
  sourcePageUrl,
  packages,
  flash,
  rows,
  initialFilters,
}: {
  generationId: string;
  productName: string;
  sourcePageUrl: string;
  packages: string[];
  flash: { tone: "ok" | "error"; text: string } | null;
  rows: OfferImageReviewRow[];
  initialFilters?: { authorization?: string; evidence?: string; review?: string; bottles?: string };
}) {
  const [authorization, setAuthorization] = useState(initialFilters?.authorization || "ALL");
  const [evidence, setEvidence] = useState(initialFilters?.evidence || "ALL");
  const [review, setReview] = useState(initialFilters?.review || "ALL");
  const [bottles, setBottles] = useState(initialFilters?.bottles || "ALL");
  const [compact, setCompact] = useState(false);
  const [failed, setFailed] = useState<Record<string, true>>({});

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => setCompact(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const bottleOptions = useMemo(() => {
    const counts = [...new Set(rows.map((row) => row.bottleCount).filter((value): value is number => value != null))].sort(
      (left, right) => left - right,
    );
    return [
      { value: "ALL", label: "Todas as quantidades" },
      ...counts.map((count) => ({ value: String(count), label: quantityLabel(count) })),
      { value: "unmapped", label: "Sem associação" },
    ];
  }, [rows]);

  const visible = rows.filter((row) => {
    if (authorization !== "ALL" && row.usageAuthorization !== authorization) return false;
    if (evidence !== "ALL" && row.evidenceStatus !== evidence) return false;
    if (review !== "ALL" && row.reviewStatus !== review) return false;
    if (bottles === "unmapped") return row.bottleCount == null;
    if (bottles !== "ALL" && String(row.bottleCount) !== bottles) return false;
    return true;
  });

  return (
    <div data-offer-image-review="admin" data-layout={compact ? "cards" : "table"}>
      {flash ? (
        <p className="oir-flash" role="alert" data-tone={flash.tone} data-approval-flash={flash.tone}>
          {flash.text}
        </p>
      ) : null}

      <ul className="oir-stats">
        <li>{rows.length} imagens</li>
        <li>{rows.filter((row) => row.operatorAttestation === "OPERATOR_APPROVED").length} OPERATOR_APPROVED</li>
        <li>{rows.filter((row) => row.eligible).length} elegíveis p/ publicação</li>
        <li>{rows.filter((row) => row.usageAuthorization === "PENDING").length} usage pending</li>
        <li>{rows.filter((row) => row.publishable).length} publicáveis</li>
        <li>Pacotes: {packages.join(", ") || "nenhum"}</li>
      </ul>

      <form action={batchEligibleOfferImagesAction} data-offer-image-batch="">
        <input type="hidden" name="generationId" value={generationId} />
        <div className="oir-toolbar">
          <div className="oir-toolbar__filters">
            <label className="oir-field">
              <span>Autorização</span>
              <select value={authorization} onChange={(event) => setAuthorization(event.target.value)} data-filter="authorization">
                {AUTHORIZATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="oir-field">
              <span>Evidência</span>
              <select value={evidence} onChange={(event) => setEvidence(event.target.value)} data-filter="evidence">
                {EVIDENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="oir-field">
              <span>Revisão</span>
              <select value={review} onChange={(event) => setReview(event.target.value)} data-filter="review">
                {REVIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="oir-field">
              <span>Frascos</span>
              <select value={bottles} onChange={(event) => setBottles(event.target.value)} data-filter="bottles">
                {bottleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="oir-toolbar__actions">
            <label className="oir-field oir-field--grow">
              <span>Justificativa e evidência de autorização</span>
              <textarea
                name="justification"
                required
                minLength={12}
                placeholder="Licença, permissão do produtor ou declaração registrada. Evidência VERIFIED de origem não autoriza o uso."
                data-justification=""
              />
            </label>
            <label className="oir-field oir-field--grow">
              <span>Nota de evidência (opcional)</span>
              <textarea name="evidenceNote" placeholder="Onde a permissão está registrada." data-evidence-note="" />
            </label>
            <button className="ds-btn" type="submit" name="decision" value="APPROVE" data-batch-approve="">
              Aprovar elegíveis selecionadas
            </button>
            <button className="ds-btn ds-btn--danger" type="submit" name="decision" value="REJECT" data-batch-reject="">
              Rejeitar selecionadas
            </button>
          </div>
          <p className="ds-caption">
            {visible.length} visíveis · {visible.filter((row) => row.eligible).length} elegíveis nesta vista · origem {sourcePageUrl} ·
            produto {productName}
          </p>
        </div>

        {visible.length === 0 ? <p className="oir-empty">Nenhuma imagem corresponde aos filtros.</p> : null}

        {compact ? (
          <div className="oir-cards" data-offer-image-cards="">
            {visible.map((row) => (
              <article
                key={row.assetId}
                className="oir-card"
                data-offer-image-asset={row.assetId}
                data-usage={row.usageAuthorization}
                data-eligible={row.eligible ? "1" : "0"}
              >
                <div className="oir-card__top">
                  <label>
                    <input type="checkbox" name="assetId" value={row.assetId} data-select-image={row.assetId} />
                  </label>
                  <OfferImageThumb row={row} failed={failed} onFail={setFailed} />
                  <div className="oir-card__meta">
                    <strong>{row.productName}</strong>
                    <span>{quantityLabel(row.bottleCount)}</span>
                    <span className="oir-muted" title={row.sourceUrl}>
                      {originLabel(row)}
                    </span>
                    <div className="oir-actions">
                      <span className={badgeClass(row.evidenceStatus)}>{row.evidenceStatus}</span>
                      <span className={badgeClass(row.operatorAttestation)} data-operator-attestation="">
                        {row.operatorAttestation}
                      </span>
                      <span className={badgeClass(row.rightsHolderLicenseStatus)} data-rights-holder="">
                        rights:{row.rightsHolderLicenseStatus}
                      </span>
                      <span className={badgeClass(row.usageAuthorization)}>{row.usageAuthorization}</span>
                      <span className={badgeClass(row.reviewStatus)}>{row.reviewStatus}</span>
                    </div>
                    <StatusNotes row={row} />
                    <RowButtons row={row} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="oir-table-wrap">
            <table className="oir-table" data-offer-image-table="">
              <colgroup>
                <col className="oir-col-check" />
                <col className="oir-col-thumb" />
                <col className="oir-col-product" />
                <col className="oir-col-qty" />
                <col className="oir-col-origin" />
                <col className="oir-col-status" />
                <col className="oir-col-status" />
                <col className="oir-col-review" />
                <col className="oir-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Sel</th>
                  <th>Imagem</th>
                  <th>Produto</th>
                  <th>Frascos</th>
                  <th>Origem</th>
                  <th>Evidência</th>
                  <th>Autorização</th>
                  <th>Revisão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.assetId} data-offer-image-asset={row.assetId} data-usage={row.usageAuthorization} data-eligible={row.eligible ? "1" : "0"}>
                    <td>
                      <input type="checkbox" name="assetId" value={row.assetId} data-select-image={row.assetId} />
                    </td>
                    <td>
                      <OfferImageThumb row={row} failed={failed} onFail={setFailed} />
                    </td>
                    <td>
                      <strong>{row.productName}</strong>
                      <p className="oir-muted">{row.assetId}</p>
                    </td>
                    <td>{quantityLabel(row.bottleCount)}</td>
                    <td>
                      <div className="oir-origin" title={row.sourceUrl}>
                        <span>{row.sourceHost}</span>
                        <code>{row.sourceFile}</code>
                      </div>
                    </td>
                    <td>
                      <span className={badgeClass(row.evidenceStatus)}>{row.evidenceStatus}</span>
                      <p className="oir-muted">Operador</p>
                      <span className={badgeClass(row.operatorAttestation)} data-operator-attestation="">
                        {row.operatorAttestation}
                      </span>
                      <p className="oir-muted">Titular</p>
                      <span className={badgeClass(row.rightsHolderLicenseStatus)} data-rights-holder="">
                        {row.rightsHolderLicenseStatus}
                      </span>
                    </td>
                    <td>
                      <span className={badgeClass(row.usageAuthorization)}>{row.usageAuthorization}</span>
                    </td>
                    <td>
                      <span className={badgeClass(row.reviewStatus)}>{row.reviewStatus}</span>
                      <StatusNotes row={row} />
                    </td>
                    <td>
                      <RowButtons row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </form>

      {rows.map((row) => (
        <div key={`actions-${row.assetId}`} hidden>
          <form id={`oir-approve-${row.assetId}`} action={decideOfferImageAction}>
            <input type="hidden" name="generationId" value={generationId} />
            <input type="hidden" name="assetId" value={row.assetId} />
            <input type="hidden" name="decision" value="APPROVE" />
            <input type="hidden" name="justification" value="" />
            <input type="hidden" name="evidenceNote" value="" />
          </form>
          <form id={`oir-reject-${row.assetId}`} action={decideOfferImageAction}>
            <input type="hidden" name="generationId" value={generationId} />
            <input type="hidden" name="assetId" value={row.assetId} />
            <input type="hidden" name="decision" value="REJECT" />
            <input type="hidden" name="justification" value="" />
            <input type="hidden" name="evidenceNote" value="" />
          </form>
        </div>
      ))}
    </div>
  );
}

function StatusNotes({ row }: { row: OfferImageReviewRow }) {
  return (
    <>
      {row.operatorAttestedBy ? (
        <p className="oir-muted" data-operator-note="">
          Operador {row.operatorAttestedBy} · {row.operatorAttestedAt}
          {row.operatorAttestationNote ? ` · ${row.operatorAttestationNote}` : ""}
        </p>
      ) : null}
      {row.publishable ? (
        <p className="oir-muted">Pronta para publicação</p>
      ) : (
        <div className="oir-blockers" data-publication-blockers={row.assetId}>
          <p className="oir-muted">Bloqueios para publicação:</p>
          <ul className="oir-history">
            {(row.publicationBlockers.length ? row.publicationBlockers : ["Revisão pendente"]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {row.eligible ? <p className="oir-muted">Elegível para aprovação de publicação</p> : null}
      {row.operatorAttestation === "OPERATOR_APPROVED" && row.rightsHolderLicenseStatus !== "PROVEN" ? (
        <p className="oir-muted">Operador já atestou. Registre a licença do titular (pode cobrir várias imagens); sem segunda aprovação.</p>
      ) : null}
      {!row.eligible && row.eligibilityReasons.includes("rights-holder-license-unproven") ? (
        <p className="oir-muted">Publicação bloqueada enquanto a licença do titular estiver UNPROVEN/DENIED.</p>
      ) : null}
      {row.authorizedBy ? (
        <p className="oir-muted">
          Uso {row.authorizedBy} · {row.authorizedAt}
        </p>
      ) : null}
      {row.history.length > 0 ? (
        <ol className="oir-history">
          {row.history.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              {event.action} · {event.actor} · {event.at} · {event.justification}
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

function RowButtons({ row }: { row: OfferImageReviewRow }) {
  return (
    <div className="oir-actions">
      <button
        className="ds-btn"
        type="submit"
        form={`oir-approve-${row.assetId}`}
        disabled={!row.eligible}
        data-approve={row.assetId}
        onClick={(event) => copyAuthorizationFields(event.currentTarget.form)}
      >
        Aprovar
      </button>
      <button
        className="ds-btn ds-btn--danger"
        type="submit"
        form={`oir-reject-${row.assetId}`}
        disabled={row.usageAuthorization === "REJECTED"}
        data-reject={row.assetId}
        onClick={(event) => copyAuthorizationFields(event.currentTarget.form)}
      >
        Rejeitar
      </button>
    </div>
  );
}

function OfferImageThumb({
  row,
  failed,
  onFail,
}: {
  row: OfferImageReviewRow;
  failed: Record<string, true>;
  onFail: (update: (current: Record<string, true>) => Record<string, true>) => void;
}) {
  return (
    <details className="oir-preview">
      <summary className="oir-thumb" data-thumb={row.assetId}>
        {failed[row.assetId] ? (
          <span className="oir-muted">Miniatura indisponível</span>
        ) : (
          <img
            src={row.thumbSrc}
            alt=""
            width={72}
            height={72}
            onError={() => onFail((current) => ({ ...current, [row.assetId]: true }))}
          />
        )}
      </summary>
      <div className="oir-lightbox">
        <div className="oir-lightbox-inner">
          <p>
            {row.productName} · {quantityLabel(row.bottleCount)} · {row.width}×{row.height}
          </p>
          <img src={row.thumbSrc} alt="" />
          <p className="oir-muted">{row.sourceUrl}</p>
        </div>
      </div>
    </details>
  );
}
