import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { buildProductEditorModel, listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { ensureEvidenceBaseline, listFieldEvidence } from "@/lib/evidence-manager";
import { listOverrideAudit, listPresentationOverlay } from "@/lib/presentation-overrides";
import { resetAllManualOverridesAction } from "@/app/admin/product-editor/[campaignId]/actions";
import { ProductEditorForm } from "@/app/admin/product-editor/[campaignId]/editor-form";
import { CompletenessAssistant } from "@/components/admin/completeness-assistant";
import { integratedVisualAssetSources } from "@/lib/visual-concept/asset-integration";

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ saved?: string; reset?: string; error?: string }>;
};

export default async function ProductEditorPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { campaignId: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();

  const notice = await searchParams;
  const facts = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const overrides = listManualOverrides(campaign.id);
  ensureEvidenceBaseline({
    campaignId: campaign.id,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    createdAt: campaign.createdAt,
    overrides,
  });
  const evidence = listFieldEvidence(campaign.id);
  const model = buildProductEditorModel(facts, campaign, overrides);
  const overlay = listPresentationOverlay(campaign.id);
  const resolved = resolveProductFacts(facts, overrides);
  const visualAssetCount = Object.values(integratedVisualAssetSources(campaign.slug)).filter(Boolean).length;
  const presentation = {
    ...overlay,
    imported: {
      headline: campaign.headline ?? "",
      subheadline: campaign.subheadline ?? "",
      shipping: (facts.shippingInformation ?? []).map((item) => item.statement).filter(Boolean).join("\n"),
      returns: (facts.returnsInformation ?? []).map((item) => item.statement).filter(Boolean).join("\n"),
      bonus: (facts.offerFacts ?? []).map((item) => item.bonuses ?? "").filter(Boolean).join("\n"),
      images: facts.productImageUrl ?? "",
      disclosure: "",
      footer: "",
    },
  };

  return (
    <div data-preview-wide className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">
            <Link href="/admin" className="hover:text-zinc-100">
              Campaigns
            </Link>
            <span className="px-2">/</span>
            <span>{campaign.name}</span>
          </p>
          <h2 className="mt-1 text-xl font-medium">Product Editor</h2>
          <p className="mt-1 font-mono text-sm text-zinc-400">{campaign.slug}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/admin/product-evidence/${campaign.id}`}
              className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Export audit JSON
            </Link>
            <Link
              href={`/admin/preview/${campaign.slug}?layer=effective`}
              className="rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/10"
            >
              Preview Effective
            </Link>
            <Link
              href={`/admin/preview/${campaign.slug}?layer=imported`}
              className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Preview Imported
            </Link>
          </div>
        </div>
      </div>
      <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-300">
        Imported ProductFacts stay unchanged. A save writes only that field. Preview, research, grounding, policy, and publication read the resolved facts. Running the importer again does not erase overrides.
      </p>
      {notice.error ? (
        <p className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {notice.error}
        </p>
      ) : null}
      {notice.saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100" role="status">
          Saved {notice.saved}. Source is now Manual Override.
        </p>
      ) : null}
      {notice.reset ? (
        <p className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200" role="status">
          {notice.reset} reset to the imported value.
        </p>
      ) : null}
      <form action={resetAllManualOverridesAction}>
        <input type="hidden" name="campaignId" value={campaign.id} />
        <button type="submit" className="text-sm text-amber-300 hover:underline">
        Reset Entire Campaign
      </button>
      </form>
      <CompletenessAssistant
        campaignId={campaign.id}
        facts={resolved}
        headline={overlay.headline || campaign.headline || null}
        imageUrl={campaign.productImageSrc || resolved.productImageUrl || null}
        imageProvenance={campaign.productImageProvenance || resolved.productImageProvenance || null}
        visualAssetCount={visualAssetCount}
        shippingText={overlay.shipping}
        returnsText={overlay.returns}
        model={model}
        presentation={presentation}
      >
        <ProductEditorForm model={model} evidence={evidence} presentation={presentation} audit={listOverrideAudit(campaign.id)} />
      </CompletenessAssistant>
    </div>
  );
}
