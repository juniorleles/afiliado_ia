import { notFound } from "next/navigation";
import { getCampaignById } from "@/lib/campaigns";
import { lintCampaign } from "@/lib/policy-linter";
import { PublishPanel } from "@/app/admin/publish-panel";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PublishPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  const campaign = getCampaignById(id);
  if (!campaign) {
    notFound();
  }

  const result = lintCampaign(campaign);

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
        Internal publish
      </p>
      <h2 className="text-xl font-medium">{campaign.name}</h2>
      <p className="font-mono text-sm text-zinc-500">/p/{campaign.slug}</p>
      <p className="text-sm text-zinc-400">
        Status: {campaign.publicationStatus === "published" ? "PUBLISHED" : "DRAFT"}.
        Policy gate: {result.gate.replaceAll("_", " ")}. This action does not
        mean Google approved the campaign.
      </p>
      <PublishPanel id={campaign.id} slug={campaign.slug} gate={result.gate} />
    </div>
  );
}
