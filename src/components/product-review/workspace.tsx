"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductReviewHeader } from "@/components/product-review/review-header";
import { SourcesStep } from "@/components/product-review/sources-step";
import { FactsStep } from "@/components/product-review/facts-step";
import { EvidenceReviewStep } from "@/components/product-review/evidence-review-step";
import { GalleryStep } from "@/components/product-review/gallery-step";
import { PreviewStep } from "@/components/product-review/preview-step";
import { confirmSourceIdentityAction, decideEvidenceCandidateAction, decideProductFactsAssetAction, decideProductFactsResearchAction, executeProductFactsResearchAction, readEvidenceReviewAction, readProductFactsResearchAction, rejectCommercialRelationAction, requestSourceEvidenceAction, startProductFactsResearchAction } from "@/app/admin/[id]/fatos/research-actions";
import type { EvidenceReviewWorkspace } from "@/lib/presell-quality/review-workspace";
import { indicatorsFromResearch } from "@/lib/product-research/indicators";
import type { AssetDecisionAction } from "@/lib/product-research/asset-display";
import type { ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";
import type { CampaignSource } from "@/lib/campaign-sources/types";
import type { KnowledgeText } from "@/lib/product-knowledge";

export function ProductReviewWorkspace({
  campaignId,
  productName,
  marketplace,
  initial,
  sources,
  knowledge,
  defaultProductUrl,
  defaultAffiliateResourceUrl = "",
  advanced,
  initialEvidence = null,
}: {
  campaignId: number;
  productName: string;
  marketplace: string;
  initial: ProductResearchRun | null;
  sources: CampaignSource[];
  knowledge: KnowledgeText;
  defaultProductUrl: string;
  defaultAffiliateResourceUrl?: string;
  advanced?: React.ReactNode;
  initialEvidence?: EvidenceReviewWorkspace | null;
}) {
  const router = useRouter();
  const [run, setRun] = useState<ProductResearchRun | null>(initial);
  const [evidence, setEvidence] = useState(initialEvidence ?? null);
  const [productUrl, setProductUrl] = useState(defaultProductUrl);
  const [affiliateResourceUrl, setAffiliateResourceUrl] = useState(defaultAffiliateResourceUrl);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRun((current) => {
      if (!initial) return current;
      if (!current) return initial;
      if (initial.runId !== current.runId) return initial;
      if (initial.coverageTotal !== current.coverageTotal || initial.reviewAccepted !== current.reviewAccepted) return initial;
      if ((initial.discoveredAssets?.length ?? 0) !== (current.discoveredAssets?.length ?? 0)) return initial;
      return current;
    });
  }, [initial]);

  useEffect(() => {
    if (evidence) return;
    void readEvidenceReviewAction({ campaignId }).then((next) => setEvidence(next));
  }, [campaignId, evidence]);

  useEffect(() => {
    if (!run || (run.status !== "QUEUED" && run.status !== "RESEARCHING")) return;
    const timer = window.setInterval(() => {
      void readProductFactsResearchAction({ campaignId, runId: run.runId }).then((next) => {
        if (next) setRun(next);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [campaignId, run]);

  function start() {
    setError("");
    startTransition(async () => {
      try {
        const created = await startProductFactsResearchAction({ campaignId, productUrl, affiliateResourceUrl });
        setRun(created);
        if (created.status === "QUEUED" || created.status === "RESEARCHING") {
          setRun(await executeProductFactsResearchAction({ campaignId, runId: created.runId }));
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível iniciar a pesquisa.");
      }
    });
  }

  function decideFacts(fields: ProductResearchField[], action: "ACCEPT" | "REJECT") {
    if (!run) return;
    startTransition(async () => {
      try {
        setRun(await decideProductFactsResearchAction({ campaignId, runId: run.runId, fields, action }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível registrar a decisão.");
      }
    });
  }

  function decideAsset(assetUrl: string, action: AssetDecisionAction) {
    if (!run) return;
    startTransition(async () => {
      try {
        setRun(await decideProductFactsAssetAction({ campaignId, runId: run.runId, assetUrl, action }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível registrar a imagem.");
      }
    });
  }

  function decideCandidate(candidateId: string, expectedVersion: number, decision: "ACCEPT" | "REJECT" | "REQUEST_NEW_EVIDENCE" | "KEEP_PENDING") {
    startTransition(async () => {
      try {
        const result = await decideEvidenceCandidateAction({ campaignId, candidateId, expectedVersion, decision });
        if (!result.ok) setError(result.reason);
        if (result.run) setRun(result.run);
        setEvidence(await readEvidenceReviewAction({ campaignId }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível registrar a evidência.");
      }
    });
  }

  function confirmIdentity(host: string, scope: "SELLER" | "AFFILIATE") {
    const documentation = window.prompt(
      scope === "SELLER"
        ? "Documente a relação de vendedor. Isso não confirma o fabricante."
        : "Documente a relação com o programa de afiliados. Isso não confirma o fabricante.",
    );
    if (!documentation?.trim()) return;
    startTransition(async () => {
      try {
        setEvidence(await confirmSourceIdentityAction({ campaignId, host, scope, documentation }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível confirmar a identidade.");
      }
    });
  }

  function rejectRelation(relationId: string) {
    const documentation = window.prompt("Documente por que esta relação comercial deve ser rejeitada.");
    if (!documentation?.trim()) return;
    startTransition(async () => {
      try {
        setEvidence(await rejectCommercialRelationAction({ campaignId, relationId, documentation }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível rejeitar a relação.");
      }
    });
  }

  function requestEvidence(host: string) {
    const documentation = window.prompt("Descreva a evidência adicional necessária para este domínio.");
    if (!documentation?.trim()) return;
    startTransition(async () => {
      try {
        setEvidence(await requestSourceEvidenceAction({ campaignId, host, documentation }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível registrar o pedido de evidência.");
      }
    });
  }

  const busy = pending || run?.status === "QUEUED" || run?.status === "RESEARCHING";
  const indicators = indicatorsFromResearch(run);

  return (
    <div className="flex flex-col gap-ds-24" data-product-review-workspace>
      <ProductReviewHeader productName={productName} marketplace={marketplace} campaignId={campaignId} run={run} />
      {error ? <p className="text-body text-red-400">{error}</p> : null}
      <Tabs defaultValue="fontes">
        <TabsList>
          <TabsTrigger value="fontes">Fontes</TabsTrigger>
          <TabsTrigger value="informacoes">Informações do produto</TabsTrigger>
          <TabsTrigger value="evidencias">Evidências</TabsTrigger>
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
          <TabsTrigger value="previa">Prévia</TabsTrigger>
        </TabsList>
        <TabsContent value="fontes">
          <SourcesStep
            sources={sources}
            productUrl={productUrl}
            affiliateResourceUrl={affiliateResourceUrl}
            onProductUrl={setProductUrl}
            onAffiliateResourceUrl={setAffiliateResourceUrl}
            onSearch={start}
            busy={busy}
            run={run}
            error={error}
          />
        </TabsContent>
        <TabsContent value="informacoes">
          <FactsStep run={run} busy={busy} onDecide={decideFacts} />
        </TabsContent>
        <TabsContent value="evidencias">
          <EvidenceReviewStep
            summary={evidence?.summary ?? { total: 0, readyForReview: 0, identityUnresolved: 0, insufficientEvidence: 0, highRisk: 0 }}
            acceptedCount={evidence?.acceptedCount ?? 0}
            gapsReady={evidence?.gaps.filter((item) => item.resolutionClass === "REQUIRES_HUMAN").length ?? 0}
            lastReviewAt={evidence?.lastReview?.at ?? null}
            queue={evidence?.queue ?? []}
            identityPanel={evidence?.identityPanel ?? []}
            verifiedSellerRelationships={evidence?.verifiedSellerRelationships ?? 0}
            verifiedManufacturerRelationships={evidence?.verifiedManufacturerRelationships ?? 0}
            partiallySupportedRelationships={evidence?.partiallySupportedRelationships ?? 0}
            unresolvedRelationships={evidence?.unresolvedRelationships ?? 0}
            regenerationGate={evidence?.regenerationGate ?? null}
            busy={busy}
            onDecide={decideCandidate}
            onConfirmIdentity={confirmIdentity}
            onRejectRelation={rejectRelation}
            onRequestEvidence={requestEvidence}
          />
        </TabsContent>
        <TabsContent value="imagens">
          <GalleryStep run={run} busy={busy} onDecide={decideAsset} />
        </TabsContent>
        <TabsContent value="previa">
          <PreviewStep campaignId={campaignId} run={run} knowledge={knowledge} />
        </TabsContent>
      </Tabs>
      <Accordion type="single" collapsible>
        <AccordionItem value="avancado">
          <AccordionTrigger>Detalhes técnicos e indicadores avançados</AccordionTrigger>
          <AccordionContent>
            <p>Research completeness: {indicators.researchCoverage.total}/{indicators.researchCoverage.max}</p>
            <p>Review completion: {indicators.reviewCompletion.percent}%</p>
            <p>Asset approval: {indicators.assetApproval.approved}/{indicators.assetApproval.total}</p>
            <p>Sandbox generation readiness: {indicators.sandboxGenerationReadiness.status}</p>
            <p>Publication readiness: {indicators.publicationReadiness.status} — {indicators.publicationReadiness.reason}</p>
            <p>Grounding {run?.grounding ?? "NOT_EVALUATED"} · Neutrality {run?.neutrality ?? "NOT_EVALUATED"} · Quality {run?.contentQuality ?? "NOT_EVALUATED"}</p>
            {advanced}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
