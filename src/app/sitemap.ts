import type { MetadataRoute } from "next";
import { listPublishedCampaigns } from "@/lib/campaigns";
import { isReleasePublication } from "@/lib/publication";
import { publicAbsoluteUrl } from "@/lib/public-site";

/** Published set and public origin are runtime state; a build-time snapshot goes stale after publish/unpublish. */
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const portal = [
    { path: "/", priority: 1, changeFrequency: "daily" as const },
    { path: "/reviews", priority: 0.9, changeFrequency: "daily" as const },
  ].map((entry) => ({ url: publicAbsoluteUrl(entry.path), changeFrequency: entry.changeFrequency, priority: entry.priority }));
  const legal = ["/about", "/editorial-policy", "/contact", "/privacy", "/terms", "/affiliate-disclosure"].map((path) => ({
    url: publicAbsoluteUrl(path),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));
  const published = listPublishedCampaigns().filter(isReleasePublication).map((campaign) => ({
    url: publicAbsoluteUrl(`/p/${campaign.slug}`),
    lastModified: campaign.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  return [...portal, ...legal, ...published];
}
