import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";

export default async function MediaManagerSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const campaign = getCampaignBySlug((await params).slug);
  if (!campaign) notFound();
  redirect(`/admin/lp-media/${campaign.id}`);
}
