"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decorateDiscoveredAssets, type AssetDecisionAction } from "@/lib/product-research/asset-display";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import type { ProductResearchRun } from "@/lib/product-research/types";

function statusLabel(status: DiscoveredAffiliateAsset["status"]): string {
  if (status === "USER_APPROVED") return "Aprovada";
  if (status === "REJECTED") return "Rejeitada";
  if (status === "RESTRICTED") return "Restrita";
  return "Revisão necessária";
}

function AssetCard({
  asset,
  busy,
  onDecide,
  onPreview,
}: {
  asset: DiscoveredAffiliateAsset;
  busy: boolean;
  onDecide: (assetUrl: string, action: AssetDecisionAction) => void;
  onPreview: (asset: DiscoveredAffiliateAsset) => void;
}) {
  const [broken, setBroken] = useState(false);
  const pending = asset.status !== "USER_APPROVED" && asset.status !== "REJECTED";
  return (
    <article className="flex flex-col gap-ds-12 rounded-ds-md border border-border p-ds-16" data-asset-url={asset.assetUrl} data-gallery-kind={asset.galleryKind ?? "OTHER"} data-kind-proposal={asset.kindProposal?.status === "PENDING" ? asset.kindProposal.proposedKind : ""}>
      <div className="relative aspect-square overflow-hidden rounded-ds-sm bg-secondary">
        {broken ? (
          <p className="flex h-full items-center justify-center p-ds-12 text-center text-caption text-muted-foreground">Imagem indisponível</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.assetUrl} alt="" className="h-full w-full object-contain" onError={() => setBroken(true)} />
        )}
        {asset.hero ? <Badge tone="success" className="absolute left-ds-8 top-ds-8">Principal</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-ds-8">
        <Badge tone="neutral">{asset.galleryKind ?? "OTHER"}</Badge>
        <Badge tone={asset.status === "USER_APPROVED" ? "success" : asset.status === "REJECTED" ? "danger" : "review"}>{statusLabel(asset.status)}</Badge>
        {asset.kindProposal?.status === "PENDING" ? <Badge tone="review">Proposta: {asset.kindProposal.proposedKind}</Badge> : null}
      </div>
      <p className="break-all text-caption text-muted-foreground">Origem: {asset.sourceUrl}</p>
      {asset.kindProposal?.status === "PENDING" ? (
        <p className="text-caption text-muted-foreground">{asset.kindProposal.reason} {asset.kindProposal.limitations[0]}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-ds-8">
        <Button type="button" size="sm" variant="secondary" onClick={() => onPreview(asset)}>Visualizar</Button>
        {pending ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => onDecide(asset.assetUrl, "ACCEPT")}>Aprovar</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(asset.assetUrl, "REJECT")}>Rejeitar</Button>
          </>
        ) : null}
        {asset.status === "USER_APPROVED" && !asset.hero ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(asset.assetUrl, "SET_HERO")}>Definir principal</Button>
        ) : null}
        {asset.kindProposal?.status === "PENDING" ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(asset.assetUrl, "CONFIRM_KIND")}>Confirmar classificação</Button>
        ) : null}
      </div>
    </article>
  );
}

export function GalleryStep({
  run,
  busy,
  onDecide,
}: {
  run: ProductResearchRun | null;
  busy: boolean;
  onDecide: (assetUrl: string, action: AssetDecisionAction) => void;
}) {
  const assets = decorateDiscoveredAssets(run?.discoveredAssets);
  const [preview, setPreview] = useState<DiscoveredAffiliateAsset | null>(null);
  return (
    <div id="etapa-imagens" className="flex flex-col gap-ds-16">
      <p className="text-body text-muted-foreground">
        Nenhuma imagem é aprovada automaticamente. Autorização de uso não valida alegações no arquivo. Imagens pendentes não entram na prévia.
      </p>
      {assets.length === 0 ? <p className="text-body text-muted-foreground">Nenhuma imagem descoberta nesta pesquisa.</p> : (
        <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
          {assets.map((asset) => (
            <AssetCard key={asset.assetUrl} asset={asset} busy={busy} onDecide={onDecide} onPreview={setPreview} />
          ))}
        </div>
      )}
      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-ds-16" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
          <div className="max-h-full max-w-3xl overflow-auto rounded-ds-lg bg-card p-ds-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.assetUrl} alt="" className="max-h-[70vh] w-auto max-w-full" />
            <p className="mt-ds-12 break-all text-caption">{preview.assetUrl}</p>
            <Button type="button" className="mt-ds-12" onClick={() => setPreview(null)}>Fechar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
