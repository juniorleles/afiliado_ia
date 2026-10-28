"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SourceIdentityPanel } from "@/components/product-review/source-identity-panel";
import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";
import type { SourceIdentityPanelRow } from "@/lib/presell-quality/commercial-graph";
import type { PrimaryPageResearchResult } from "@/lib/presell-quality/primary-page-research";
import { buildReviewPresentation } from "@/lib/presell-quality/review-presentation";
import {
  REVIEW_ACTION_LABEL,
  REVIEW_COPY,
  REVIEW_GATE_LABEL,
  REVIEW_GROUP_LABEL,
  reviewGroupOf,
  reviewStateLabel,
  type ReviewGroupId,
} from "@/lib/presell-quality/review-labels";

type RegenerationGateView = {
  ready: boolean;
  status: "APPROVED_FACTS_READY_FOR_REGENERATION" | "AWAITING_HUMAN_REVIEW";
};

function toneFor(state: string): "success" | "warning" | "review" | "danger" | "info" | "neutral" {
  if (state === "READY_FOR_REVIEW") return "review";
  if (state === "ALREADY_ACCEPTED") return "success";
  if (state === "HIGH_RISK_CLAIM" || state === "REJECTED") return "danger";
  if (state === "SOURCE_IDENTITY_UNRESOLVED") return "warning";
  return "neutral";
}

function groupCounts(items: PreparedReviewCandidate[]) {
  return {
    awaiting: items.filter((item) => item.state === "READY_FOR_REVIEW").length,
    approved: items.filter((item) => item.state === "ALREADY_ACCEPTED").length,
    rejected: items.filter((item) => item.state === "REJECTED").length,
    pending: items.filter((item) => item.state !== "READY_FOR_REVIEW" && item.state !== "ALREADY_ACCEPTED" && item.state !== "REJECTED").length,
  };
}

export function EvidenceReviewStep({
  summary,
  acceptedCount,
  gapsReady,
  lastReviewAt,
  queue,
  identityPanel,
  verifiedSellerRelationships,
  verifiedManufacturerRelationships,
  partiallySupportedRelationships,
  unresolvedRelationships,
  regenerationGate,
  primaryPage,
  productName,
  busy,
  onDecide,
  onConfirmIdentity,
  onRejectRelation,
  onRequestEvidence,
}: {
  summary: { total: number; readyForReview: number; identityUnresolved: number; insufficientEvidence: number; highRisk: number };
  acceptedCount: number;
  gapsReady: number;
  lastReviewAt: string | null;
  queue: PreparedReviewCandidate[];
  identityPanel: SourceIdentityPanelRow[];
  verifiedSellerRelationships: number;
  verifiedManufacturerRelationships: number;
  partiallySupportedRelationships: number;
  unresolvedRelationships: number;
  regenerationGate?: RegenerationGateView | null;
  primaryPage?: PrimaryPageResearchResult | null;
  productName?: string | null;
  busy: boolean;
  onDecide: (candidateId: string, version: number, decision: "ACCEPT" | "REJECT" | "REQUEST_NEW_EVIDENCE" | "KEEP_PENDING", presentationVersion?: string) => void;
  onConfirmIdentity: (host: string, scope: "SELLER" | "AFFILIATE") => void;
  onRejectRelation: (relationId: string) => void;
  onRequestEvidence: (host: string) => void;
}) {
  const cards = useMemo(() => queue.map((item) => ({
    item,
    presented: buildReviewPresentation({
      candidateId: item.candidateId,
      version: item.version,
      extractedValue: item.extractedValue,
      originalExcerpt: item.originalExcerpt,
      sourceHost: item.sourceHost,
      sourceUrl: item.sourceUrl,
      field: item.field,
      primaryAffiliate: item.primaryAffiliate,
      productName: productName ?? undefined,
    }),
  })), [queue, productName]);
  const primaryReady = cards.filter((row) => row.item.primaryAffiliate && row.item.state === "READY_FOR_REVIEW");
  const primaryAutoApproved = cards.filter((row) => row.item.primaryAffiliate && row.item.approvalOrigin === "PRIMARY_SOURCE_POLICY");
  const primaryBlocked = cards.filter((row) => row.item.primaryAffiliate && row.item.state !== "READY_FOR_REVIEW" && row.item.approvalOrigin !== "PRIMARY_SOURCE_POLICY");
  const readyCards = cards.filter((row) => row.item.state === "READY_FOR_REVIEW" && !row.item.primaryAffiliate);
  const checkingCards = cards.filter((row) => row.item.state !== "READY_FOR_REVIEW" && !row.item.primaryAffiliate && row.item.approvalOrigin !== "PRIMARY_SOURCE_POLICY");
  const domainPrompt = identityPanel.some((row) => row.state === "CONTRADICTED") && identityPanel.some((row) => row.primaryAffiliate);
  const groups: ReviewGroupId[] = ["shipping", "returns", "refund", "other"];
  const [openGroup, setOpenGroup] = useState<string>("shipping");

  return (
    <div id="etapa-evidencias" className="flex flex-col gap-ds-24" data-evidence-review data-operational-review data-friendly-review>
      <section className="rounded-ds-md border border-border p-ds-16" data-review-summary>
        <h2 className="text-label">{REVIEW_COPY.summaryTitle}</h2>
        <p className="mt-ds-8 text-body">{REVIEW_COPY.summaryHelp}</p>
        <div className="mt-ds-16 grid gap-ds-12 md:grid-cols-2">
          <p className="text-body">{acceptedCount} {REVIEW_COPY.approved}</p>
          <p className="text-body" data-ready-highlight>{summary.readyForReview} {REVIEW_COPY.waitingNow}</p>
          <p className="text-body">{summary.insufficientEvidence} {REVIEW_COPY.extraProof}</p>
          <p className="text-body">{summary.highRisk} {REVIEW_COPY.blocked}</p>
        </div>
        <p className="mt-ds-12 text-caption text-muted-foreground">Última análise: {lastReviewAt || "Nenhuma"}</p>
        <p className="mt-ds-8 text-caption text-muted-foreground" data-regeneration-gate={regenerationGate?.status ?? "AWAITING_HUMAN_REVIEW"}>
          {REVIEW_GATE_LABEL[regenerationGate?.status ?? "AWAITING_HUMAN_REVIEW"]}
        </p>
        <p className="sr-only">Lacunas com ação humana: {gapsReady}</p>
      </section>

      {primaryPage ? (
        <section className="rounded-ds-md border border-border p-ds-16" data-primary-page-review>
          <h2 className="text-label">{REVIEW_COPY.primaryTitle}</h2>
          <p className="mt-ds-8 text-body">{REVIEW_COPY.primaryHelp}</p>
          <div className="mt-ds-16 grid gap-ds-12 md:grid-cols-2">
            <p className="text-body">{primaryPage.inventory?.facts.length ?? 0} {REVIEW_COPY.primaryFound}</p>
            <p className="text-body">{primaryPage.inventory?.faqs.filter((item) => item.answer).length ?? 0} {REVIEW_COPY.primaryFaqs}</p>
            <p className="text-body" data-primary-auto-approved-count>{primaryAutoApproved.length} {REVIEW_COPY.primaryAutoApproved}</p>
            <p className="text-body" data-primary-ready-count>{primaryReady.length} {REVIEW_COPY.primaryApprovable}</p>
            <p className="text-body">{primaryBlocked.length} {REVIEW_COPY.primaryBlocked}</p>
          </div>
          {primaryAutoApproved.length ? (
            <div className="mt-ds-16 flex flex-col gap-ds-16" data-primary-auto-approved>
              {primaryAutoApproved.map(({ item, presented }) => (
                <article key={item.candidateId} className="rounded-ds-md border border-border p-ds-16" data-candidate-id={item.candidateId} data-review-state={item.state} data-approval-origin="PRIMARY_SOURCE_POLICY" data-ready="false">
                  <div className="flex flex-wrap items-start justify-between gap-ds-8">
                    <h3 className="text-label">{presented.title}</h3>
                    <Badge tone="success">{REVIEW_COPY.autoApprovedTitle}</Badge>
                  </div>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.found}</p>
                  <p className="mt-ds-8 text-body">{presented.found}</p>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.source}</p>
                  <p className="mt-ds-8 text-body">{presented.source}</p>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.meaning}</p>
                  {presented.attention.map((line) => <p key={line} className="mt-ds-8 text-body">{line}</p>)}
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.preview}</p>
                  <p className="mt-ds-8 text-body" data-preview-text>{presented.preview}</p>
                  <Accordion type="single" collapsible className="mt-ds-16">
                    <AccordionItem value="tech">
                      <AccordionTrigger>{REVIEW_COPY.technical}</AccordionTrigger>
                      <AccordionContent>
                        <p>Candidate ID: {item.candidateId}</p>
                        <p>Evidence ID: {item.evidenceReference}</p>
                        <p>Origem da aprovação: PRIMARY_SOURCE_POLICY</p>
                        <p>Versão da política: 1</p>
                        <p className="break-all">URL: {item.sourceUrl || "—"}</p>
                        <p>Texto original: {item.originalExcerpt}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </article>
              ))}
            </div>
          ) : null}
          {domainPrompt ? (
            <article className="mt-ds-16 rounded-ds-md border border-warning p-ds-12" data-domain-confirmation>
              <h3 className="text-label">{REVIEW_COPY.domainConfirmTitle}</h3>
              <p className="mt-ds-8 text-body">{REVIEW_COPY.domainConfirmHelp}</p>
            </article>
          ) : null}
          {primaryReady.length ? (
            <div className="mt-ds-16 flex flex-col gap-ds-16" data-primary-eligible>
              {primaryReady.map(({ item, presented }) => (
                <article key={item.candidateId} className="rounded-ds-md border border-primary p-ds-16" data-candidate-id={item.candidateId} data-review-state={item.state} data-ready="true" data-preview-version={presented.previewVersion}>
                  <div className="flex flex-wrap items-start justify-between gap-ds-8">
                    <h3 className="text-label">{presented.title}</h3>
                    <Badge tone={toneFor(item.state)}>{reviewStateLabel(item.state, item.approvalOrigin)}</Badge>
                  </div>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.found}</p>
                  <p className="mt-ds-8 text-body">{presented.found}</p>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.source}</p>
                  <p className="mt-ds-8 text-body">{presented.source}</p>
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.meaning}</p>
                  {presented.attention.map((line) => <p key={line} className="mt-ds-8 text-body">{line}</p>)}
                  <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.preview}</p>
                  <p className="mt-ds-8 text-body" data-preview-text>{presented.preview}</p>
                  <p className="mt-ds-16 text-label">{REVIEW_COPY.question}</p>
                  <div className="mt-ds-12 flex flex-wrap gap-ds-8">
                    {item.availableActions.includes("ACCEPT_ELIGIBLE_FACT") && presented.translationSafe ? (
                      <Button type="button" size="sm" disabled={busy || !item.eligible} onClick={() => onDecide(item.candidateId, item.version, "ACCEPT", presented.previewVersion)}>
                        {REVIEW_ACTION_LABEL.ACCEPT}
                      </Button>
                    ) : null}
                    {item.availableActions.includes("REJECT_CANDIDATE") ? (
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REJECT")}>
                        {REVIEW_ACTION_LABEL.REJECT}
                      </Button>
                    ) : null}
                    {item.availableActions.includes("REQUEST_NEW_EVIDENCE") ? (
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REQUEST_NEW_EVIDENCE")}>
                        {REVIEW_ACTION_LABEL.REQUEST_NEW_EVIDENCE}
                      </Button>
                    ) : null}
                    {item.availableActions.includes("KEEP_PENDING") ? (
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "KEEP_PENDING")}>
                        {REVIEW_ACTION_LABEL.KEEP_PENDING}
                      </Button>
                    ) : null}
                  </div>
                  <Accordion type="single" collapsible className="mt-ds-16">
                    <AccordionItem value="tech">
                      <AccordionTrigger>{REVIEW_COPY.technical}</AccordionTrigger>
                      <AccordionContent>
                        <p>Candidate ID: {item.candidateId}</p>
                        <p>Evidence ID: {item.evidenceReference}</p>
                        <p className="break-all">URL: {item.sourceUrl || "—"}</p>
                        <p>Texto original: {item.originalExcerpt}</p>
                        <p>Tipo de fonte: {item.sourceClass}</p>
                        <p>Estado de identidade: {item.sourceIdentity} ({item.sourceRole})</p>
                        <p>Risco: {item.riskClass}</p>
                        <p>Versão: {item.version}</p>
                        <p>Prévia versionada: {presented.previewVersion}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </article>
              ))}
            </div>
          ) : null}
          {primaryBlocked.length ? (
            <div className="mt-ds-24" data-primary-blocked>
              <h3 className="text-label">{REVIEW_COPY.blockedTitle}</h3>
              <p className="mt-ds-8 text-caption text-muted-foreground">{REVIEW_COPY.blockedHelp}</p>
              <div className="mt-ds-16 flex flex-col gap-ds-12">
                {primaryBlocked.map(({ item, presented }) => (
                  <article key={item.candidateId} className="rounded-ds-md border border-border p-ds-12" data-candidate-id={item.candidateId} data-review-state={item.state} data-ready="false">
                    <h4 className="text-label">{presented.title}</h4>
                    <p className="mt-ds-8 text-body">{item.blockerPt || presented.found}</p>
                    <p className="mt-ds-8 text-caption text-muted-foreground">{presented.source}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-label">{REVIEW_COPY.needsDecision}</h2>
        <p className="mt-ds-8 text-caption text-muted-foreground">Só estas informações podem ser aprovadas agora.</p>
        <Accordion type="single" collapsible value={openGroup} onValueChange={setOpenGroup} className="mt-ds-16">
          {groups.map((group) => {
            const items = readyCards.filter((row) => reviewGroupOf(row.presented.theme) === group);
            if (!items.length && group === "other") return null;
            const counts = groupCounts(items.map((row) => row.item));
            return (
              <AccordionItem key={group} value={group} data-review-group={group}>
                <AccordionTrigger>
                  {REVIEW_GROUP_LABEL[group]} · {items.length} {REVIEW_COPY.awaitingCount.toLowerCase()}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-caption">
                    {REVIEW_COPY.awaitingCount}: {counts.awaiting} · {REVIEW_COPY.approvedCount}: {counts.approved} · {REVIEW_COPY.rejectedCount}: {counts.rejected} · {REVIEW_COPY.pendingCount}: {counts.pending}
                  </p>
                  <div className="mt-ds-16 flex flex-col gap-ds-16">
                    {items.map(({ item, presented }) => (
                      <article key={item.candidateId} className="rounded-ds-md border border-primary p-ds-16" data-candidate-id={item.candidateId} data-review-state={item.state} data-ready={item.eligible ? "true" : "false"} data-theme={presented.theme} data-preview-version={presented.previewVersion}>
                        <div className="flex flex-wrap items-start justify-between gap-ds-8">
                          <h3 className="text-label">{presented.title}</h3>
                          <Badge tone={toneFor(item.state)}>{reviewStateLabel(item.state, item.approvalOrigin)}</Badge>
                        </div>
                        <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.found}</p>
                        <p className="mt-ds-8 text-body">{presented.found}</p>
                        <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.source}</p>
                        <p className="mt-ds-8 text-body">{presented.source}</p>
                        <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.attention}</p>
                        {presented.attention.map((line) => <p key={line} className="mt-ds-8 text-body">{line}</p>)}
                        <p className="mt-ds-16 text-caption text-muted-foreground">{REVIEW_COPY.preview}</p>
                        {presented.translationSafe ? (
                          <p className="mt-ds-8 text-body" data-preview-text>{presented.preview}</p>
                        ) : (
                          <p className="mt-ds-8 text-body" data-unsafe-translation>{REVIEW_COPY.unsafe}</p>
                        )}
                        <p className="mt-ds-16 text-label">{REVIEW_COPY.question}</p>
                        <div className="mt-ds-12 flex flex-wrap gap-ds-8">
                          {item.availableActions.includes("ACCEPT_ELIGIBLE_FACT") && presented.translationSafe ? (
                            <Button type="button" size="sm" disabled={busy || !item.eligible} onClick={() => onDecide(item.candidateId, item.version, "ACCEPT", presented.previewVersion)}>
                              {REVIEW_ACTION_LABEL.ACCEPT}
                            </Button>
                          ) : null}
                          {item.availableActions.includes("REJECT_CANDIDATE") ? (
                            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REJECT")}>
                              {REVIEW_ACTION_LABEL.REJECT}
                            </Button>
                          ) : null}
                          {item.availableActions.includes("REQUEST_NEW_EVIDENCE") ? (
                            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REQUEST_NEW_EVIDENCE")}>
                              {REVIEW_ACTION_LABEL.REQUEST_NEW_EVIDENCE}
                            </Button>
                          ) : null}
                          {item.availableActions.includes("KEEP_PENDING") ? (
                            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "KEEP_PENDING")}>
                              {REVIEW_ACTION_LABEL.KEEP_PENDING}
                            </Button>
                          ) : null}
                        </div>
                        <Accordion type="single" collapsible className="mt-ds-16">
                          <AccordionItem value="tech">
                            <AccordionTrigger>{REVIEW_COPY.technical}</AccordionTrigger>
                            <AccordionContent>
                              <p>Candidate ID: {item.candidateId}</p>
                              <p>Evidence ID: {item.evidenceReference}</p>
                              <p className="break-all">URL: {item.sourceUrl || "—"}</p>
                              <p>Texto original: {item.originalExcerpt}</p>
                              <p>Tipo de fonte: {item.sourceClass}</p>
                              <p>Estado de identidade: {item.sourceIdentity} ({item.sourceRole})</p>
                              <p>Risco: {item.riskClass}</p>
                              <p>Condições: {presented.attention.join(" ")}</p>
                              <p>Versão: {item.version}</p>
                              <p>Prévia versionada: {presented.previewVersion}</p>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </article>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      <section>
        <h2 className="text-label">{REVIEW_COPY.stillChecking}</h2>
        <p className="mt-ds-8 text-caption text-muted-foreground">
          Estas {checkingCards.length} informações ainda não pedem uma decisão agora. O sistema continua verificando a origem ou bloqueou o conteúdo por segurança.
        </p>
        <Accordion type="single" collapsible className="mt-ds-16">
          <AccordionItem value="checking">
            <AccordionTrigger>Ver informações em verificação ({checkingCards.length})</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-ds-12">
                {checkingCards.map(({ item, presented }) => (
                  <article key={item.candidateId} className="rounded-ds-md border border-border p-ds-16" data-candidate-id={item.candidateId} data-review-state={item.state} data-ready="false">
                    <div className="flex flex-wrap items-center justify-between gap-ds-8">
                      <h3 className="text-label">{presented.title}</h3>
                      <Badge tone={toneFor(item.state)}>{reviewStateLabel(item.state, item.approvalOrigin)}</Badge>
                    </div>
                    <p className="mt-ds-8 text-body">{presented.found}</p>
                    <p className="mt-ds-8 text-caption">{item.blocker}</p>
                    <div className="mt-ds-12 flex flex-wrap gap-ds-8">
                      {item.availableActions.includes("REJECT_CANDIDATE") ? (
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REJECT")}>
                          {REVIEW_ACTION_LABEL.REJECT}
                        </Button>
                      ) : null}
                      {item.availableActions.includes("REQUEST_NEW_EVIDENCE") ? (
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REQUEST_NEW_EVIDENCE")}>
                          {REVIEW_ACTION_LABEL.REQUEST_NEW_EVIDENCE}
                        </Button>
                      ) : null}
                      {item.availableActions.includes("KEEP_PENDING") ? (
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "KEEP_PENDING")}>
                          {REVIEW_ACTION_LABEL.KEEP_PENDING}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <SourceIdentityPanel
        rows={identityPanel}
        verifiedSellerRelationships={verifiedSellerRelationships}
        verifiedManufacturerRelationships={verifiedManufacturerRelationships}
        partiallySupportedRelationships={partiallySupportedRelationships}
        unresolvedRelationships={unresolvedRelationships}
        busy={busy}
        onConfirm={onConfirmIdentity}
        onReject={onRejectRelation}
        onRequestEvidence={onRequestEvidence}
      />
    </div>
  );
}
