import type { Metadata } from "next";
import { CampaignDraftPreview } from "@/components/operations/watchlist-view";

export const metadata: Metadata = { title: "Rascunho de campanha" };

export default async function CampaignDraftPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  return <CampaignDraftPreview productId={produto} />;
}
