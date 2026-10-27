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
import "@/app/design-system-lab.css";
import "@/app/renderer-v4-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Preview da LP gerada",
  robots: { index: false, follow: false },
};

export default async function LpGenerationPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const record = readGeneration(id);
  const stored = readGenerationModel(id);
  if (!record || !stored) notFound();
  const patch = readQualityPatch(id);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const model = record.sandbox?.enabled
    ? applySandboxToModel(patched, { href: record.sandbox.ctaPath })
    : patched;
  return (
    <div
      className="ds-root"
      data-ds-theme={model.theme}
      data-ds-composition={model.composition}
      data-ds-density={model.density}
      data-ds-sticky={model.sticky ? "on" : "off"}
      data-lab="lp-generator"
      data-lab-generation={record.id}
      data-v4-status={model.blueprint.strategyStatus}
      data-sandbox={record.sandbox?.enabled ? "true" : undefined}
    >
      <DsTokenStyle />
      <a className="ds-skip" href="#hero">
        Skip to content
      </a>
      <div className="ds-labbar">
        <div className="ds-labbar__meta">
          <span>{record.sandbox?.enabled ? "Lab · SANDBOX · not published" : "Lab · LP gerada · not published"}</span>
          <span>{record.status}</span>
          <span>{COMPOSITIONS[model.composition].name}</span>
          <span>{THEMES[model.theme].label}</span>
          <span>{model.blueprint.conversionGoal}</span>
        </div>
        <Link href={`/admin/lab/lp-generator/${record.id}`}>Detalhes da geração</Link>
      </div>
      <div className="ds-topbar">
        <span className="ds-topbar__name">{model.contract.identity.productName}</span>
      </div>
      <V4Page model={model} />
    </div>
  );
}
