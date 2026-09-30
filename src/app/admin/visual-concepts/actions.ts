"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";
import { openaiApiKeyConfigured } from "@/lib/visual-concept/config";
import { generateVisualConcepts } from "@/lib/visual-concept/engine";
import { createOpenAiImageProvider } from "@/lib/visual-concept/provider";
import { saveSelection, visualDesignRoot } from "@/lib/visual-concept/store";
import type { VisualDirectionKey } from "@/lib/visual-concept/types";

function back(slug: string, notice: string): never {
  redirect(`/admin/visual-concepts/${slug}?notice=${encodeURIComponent(notice)}`);
}

export async function generateVisualConceptsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(formData.get("slug") || "");
  const campaign = getCampaignBySlug(slug);
  if (!campaign) back(slug, "missing-campaign");
  const result = await generateVisualConcepts(
    {
      campaign,
      generationReason: String(formData.get("generationReason") || ""),
      generationRequestId: String(formData.get("generationRequestId") || ""),
      confirmGeneration: formData.get("confirmGeneration") === "yes",
      regenerate: formData.get("regenerate") === "yes",
    },
    {
      root: visualDesignRoot(),
      provider: createOpenAiImageProvider(),
      apiKeyConfigured: () => openaiApiKeyConfigured(),
    },
  );
  back(slug, result.status);
}

export async function selectVisualDirectionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(formData.get("slug") || "");
  const generationId = String(formData.get("generationId") || "");
  const directionKey = String(formData.get("directionKey") || "") as VisualDirectionKey;
  if (directionKey !== "a" && directionKey !== "b" && directionKey !== "c") back(slug, "invalid-direction");
  const family = directionKey === "a" ? "PREMIUM_EDITORIAL" : directionKey === "b" ? "PREMIUM_PRODUCT" : "PREMIUM_CONVERSION";
  saveSelection(visualDesignRoot(), slug, {
    visualDirectionSelected: family,
    generationId,
    directionKey,
    selectedAt: new Date().toISOString(),
    humanPublicationApproved: false,
  });
  back(slug, "VISUAL_DIRECTION_SELECTED");
}
