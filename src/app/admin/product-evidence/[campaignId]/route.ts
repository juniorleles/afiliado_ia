import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { ensureEvidenceBaseline, exportAudit } from "@/lib/evidence-manager";
import { listManualOverrides } from "@/lib/manual-overrides";

type Props = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  await requireAdmin();
  const { campaignId: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }
  const campaign = getCampaignById(id);
  if (!campaign) return Response.json({ error: "Campaign not found." }, { status: 404 });
  ensureEvidenceBaseline({
    campaignId: campaign.id,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    createdAt: campaign.createdAt,
    overrides: listManualOverrides(campaign.id),
  });
  const payload = exportAudit(campaign.id);
  return Response.json(payload, {
    headers: {
      "content-disposition": `attachment; filename="audit-${campaign.id}.json"`,
    },
  });
}
