import type { MetadataRoute } from "next";
import { listPublishedCampaigns } from "@/lib/campaigns";
import { publicAbsoluteUrl } from "@/lib/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure"].map((path) => ({
    url: publicAbsoluteUrl(path),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));
  const published = listPublishedCampaigns().map((campaign) => ({
    url: publicAbsoluteUrl(`/p/${campaign.slug}`),
    lastModified: campaign.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  return [...legal, ...published];
}
