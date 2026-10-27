import { GenerateClient } from "./generate-client";
import { getCampaignById, listCampaigns } from "@/lib/campaigns";
import { MARKETPLACES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { readKnowledgeText } from "@/lib/product-knowledge";
import { snapshotProductResearch } from "@/lib/product-research/run";
import { readCampaignSources } from "@/lib/campaign-sources/store";

export const maxDuration = 60;

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = typeof query.campaignId === "string" ? Number(query.campaignId) : NaN;
  const campaign = Number.isInteger(raw) && raw > 0 ? getCampaignById(raw) : undefined;
  const brief = campaign ? readCampaignBrief(campaign.id) : null;
  const knowledge = campaign ? readKnowledgeText(campaign, brief).text : null;
  const research = campaign ? snapshotProductResearch(campaign.id) : { latest: null };
  const sources = campaign ? readCampaignSources(campaign.id) : [];
  return (
    <div data-preview-wide>
      <h2 className="mb-1 text-xl font-medium">Presell Content Engine V2</h2>
      <p className="mb-8 text-sm text-zinc-400">
        Product facts come from the campaign research contract. Import without a
        campaign stays a sandbox session and is not publication readiness.
        Generation never publishes. AI copy is not evidence.
      </p>
      <GenerateClient
        campaignId={campaign?.id ?? null}
        campaignName={campaign?.name ?? brief?.productName ?? null}
        marketplace={brief ? labelFor(MARKETPLACES, brief.marketplace) : "Não informado"}
        campaigns={listCampaigns().map((item) => ({ id: item.id, name: item.name }))}
        initialRun={research.latest}
        defaultProductUrl={knowledge?.productUrl ?? ""}
        knowledge={knowledge}
        sources={sources}
      />
    </div>
  );
}
