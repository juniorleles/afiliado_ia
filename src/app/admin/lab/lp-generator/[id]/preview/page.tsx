import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { readGeneration, readGenerationModel } from "@/lib/lp-generator/store";
import { COMPOSITIONS } from "@/lib/design-system/compose";
import { THEMES } from "@/lib/design-system/tokens";
import { DsTokenStyle } from "@/components/design-system/primitives";
import { V4Page } from "@/components/product-showcase/v4/page";
import { applySandboxToModel } from "@/lib/sandbox/cta";
import { applyQualityPatch, readQualityPatch } from "@/lib/presell-quality/patch";
import { disableCommercialCta } from "@/lib/presell-quality/content-safety";
import { PREMIUM_DISPLAY_THEME } from "@/lib/presell-quality/premium-design";
import { resolveRendererCandidate } from "@/lib/presell-quality/renderer-candidate";
import "@/app/design-system-lab.css";
import "@/app/renderer-v4-lab.css";
import "@/app/premium-design-engine.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Preview da LP gerada",
  robots: { index: false, follow: false },
};

export default async function LpGenerationPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visualCapture?: string | string[]; candidate?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const captureFlag = query.visualCapture;
  const visitorCapture = (Array.isArray(captureFlag) ? captureFlag[0] : captureFlag) === "visitor";
  const requestedCandidate = Array.isArray(query.candidate) ? query.candidate[0] : query.candidate;
  const record = readGeneration(id);
  const stored = readGenerationModel(id);
  if (!record || !stored) notFound();
  const renderer = resolveRendererCandidate({ requested: requestedCandidate, campaignId: record.campaignId });
  const patch = readQualityPatch(id);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const sandboxed = record.sandbox?.enabled
    ? applySandboxToModel(patched, { href: record.sandbox.ctaPath })
    : patched;
  const model = disableCommercialCta(sandboxed);
  return (
    <div
      className="ds-root"
      data-ds-theme={PREMIUM_DISPLAY_THEME}
      data-ds-engine="premium"
      data-ds-composition={model.composition}
      data-ds-density={model.density}
      data-ds-sticky={model.sticky ? "on" : "off"}
      data-lab="lp-generator"
      data-lab-generation={record.id}
      data-visual-capture={visitorCapture ? "visitor" : "lab"}
      data-v4-status={model.blueprint.strategyStatus}
      data-sandbox={record.sandbox?.enabled ? "true" : undefined}
      data-presell-candidate={renderer.id}
    >
      <DsTokenStyle />
      {visitorCapture ? null : (
        <>
          <a className="ds-skip" href="#hero">
            Skip to content
          </a>
          <div className="ds-labbar">
            <div className="ds-labbar__meta">
              <span>{record.sandbox?.enabled ? "Lab · SANDBOX · not published" : "Lab · LP gerada · not published"}</span>
              <span>{record.status}</span>
              <span>{COMPOSITIONS[model.composition].name}</span>
              <span>{THEMES[PREMIUM_DISPLAY_THEME].label}</span>
              <span>{model.blueprint.conversionGoal}</span>
              <span>{renderer.id}</span>
            </div>
            <Link href={`/admin/lab/lp-generator/${record.id}`}>Detalhes da geração</Link>
          </div>
          <div className="ds-topbar">
            <span className="ds-topbar__name">{model.contract.identity.productName}</span>
          </div>
        </>
      )}
      <V4Page model={model} candidate={renderer.id} campaignId={record.campaignId} />
    </div>
  );
}
