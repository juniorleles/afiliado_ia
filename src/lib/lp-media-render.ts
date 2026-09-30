/**
 * Applies saved media assignments onto an in-memory page.
 * The stored composition and ProductFacts are not written.
 * With no assignments, the campaign and render assets stay the same objects.
 */

import type { Campaign } from "@/lib/campaigns";
import type { PresellRenderAssets } from "@/lib/presell-render-assets";
import { NO_PRESELL_RENDER_ASSETS } from "@/lib/presell-render-assets";
import { parsePresellPage, serializePresellPage, type PresellPage } from "@/lib/presell-page";
import type { IntegratedVisualAssets, VisualAssetBinding } from "@/lib/visual-concept/asset-binding";
import {
  buildMediaSlots,
  presentationSrc,
  resolveMedia,
  type MediaAssignment,
  type MediaOrigin,
  type MediaSlotSeed,
  type ResolvedMediaSlot,
} from "@/lib/lp-builder/media";
import { listMediaOverrides } from "@/lib/lp-builder/media-store";

function factKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function originFor(provenance: string | undefined, src: string): MediaOrigin {
  if (!src) return "generated";
  if (provenance === "DIRECT_SOURCE") return "imported";
  if (provenance === "MANUAL") return "uploaded";
  return "generated";
}

export function mediaSeedsFor(page: PresellPage | null, assets: PresellRenderAssets): MediaSlotSeed[] {
  const seeds: MediaSlotSeed[] = [];
  const hero = page?.hero.image;
  seeds.push({
    id: "heroImage",
    section: "hero",
    role: "heroImage",
    label: "Hero image",
    src: hero?.src ?? "",
    alt: hero?.alt ?? "",
    origin: originFor(hero?.provenance, hero?.src ?? ""),
    source: hero?.src || "generated",
    order: 0,
  });
  const visual = assets.visualAssets;
  const visualSeed = (id: MediaSlotSeed["role"], binding: VisualAssetBinding, label: string, order: number) => {
    const src = visual[binding] ?? "";
    if (!src) return;
    seeds.push({ id, role: id, label, src, alt: label, origin: "generated", source: src, order });
  };
  visualSeed("heroBackground", "heroAtmosphere", "Hero background", 1);
  visualSeed("sectionIllustration", "editorialMaterial", "Section illustration", 2);
  visualSeed("closingHero", "decisionBackground", "Closing hero", 3);
  visualSeed("guaranteeBadge", "returnPolicyVisual", "Guarantee badge", 4);
  const ingredients = page?.sections.find((section) => section.id === "ingredients");
  (ingredients?.cards ?? []).forEach((card, index) => {
    const key = factKey(card.title);
    const bound = (assets.ingredientVisuals ?? []).find((item) => factKey(item.factValue) === key);
    seeds.push({
      id: `ingredientImage.${index}`,
      section: "ingredients",
      role: "ingredientImage",
      label: card.title || `Ingredient image ${index + 1}`,
      src: bound?.src ?? "",
      alt: card.title,
      origin: bound?.src ? "generated" : "generated",
      source: bound?.src || "generated",
      order: index,
    });
  });
  const features = page?.sections.find((section) => section.id === "features");
  (features?.cards ?? []).forEach((card, index) => {
    const shared = index === 0 ? visual.featureVisual ?? "" : "";
    seeds.push({
      id: `featureImage.${index}`,
      section: "features",
      role: "featureImage",
      label: card.title || `Feature image ${index + 1}`,
      src: shared,
      alt: card.title,
      origin: "generated",
      source: shared || "generated",
      order: index,
    });
    seeds.push({
      id: `featureIcon.${index}`,
      section: "features",
      role: "featureIcon",
      label: card.title || `Feature icon ${index + 1}`,
      alt: card.title,
      origin: "generated",
      source: "generated",
      order: index,
    });
  });
  return seeds;
}

function assignmentsFrom(campaignId: number): MediaAssignment[] {
  return listMediaOverrides(campaignId).map((row) => ({
    slotId: row.slotId,
    removed: row.removed,
    reason: row.reason,
    fields: row.fields,
  }));
}

function firstOverride(slots: readonly ResolvedMediaSlot[], role: ResolvedMediaSlot["slot"]["role"]): ResolvedMediaSlot | null {
  return slots
    .filter((slot) => slot.slot.role === role && slot.override)
    .sort((a, b) => a.effective.order - b.effective.order || a.slot.id.localeCompare(b.slot.id))[0] ?? null;
}

export function presentMedia(
  page: PresellPage,
  assets: PresellRenderAssets,
  assignments: readonly MediaAssignment[],
): { page: PresellPage; assets: PresellRenderAssets } {
  if (assignments.length === 0) return { page, assets };
  const resolved = resolveMedia({ slots: buildMediaSlots(mediaSeedsFor(page, assets)), assignments }).slots;
  let nextPage = page;
  const hero = resolved.find((slot) => slot.slot.id === "heroImage" && slot.override);
  if (hero && (hero.effective.src !== page.hero.image.src || hero.effective.alt !== page.hero.image.alt)) {
    nextPage = {
      ...page,
      hero: { ...page.hero, image: { ...page.hero.image, src: presentationSrc(hero.effective.src), alt: hero.effective.alt } },
    };
  }
  const visualAssets: IntegratedVisualAssets = { ...assets.visualAssets };
  let visualsChanged = false;
  const paint = (binding: VisualAssetBinding, slot: ResolvedMediaSlot | null) => {
    if (!slot) return;
    const src = presentationSrc(slot.effective.src);
    if ((assets.visualAssets[binding] ?? "") === src) return;
    if (src) visualAssets[binding] = src;
    else delete visualAssets[binding];
    visualsChanged = true;
  };
  paint("heroAtmosphere", resolved.find((slot) => slot.slot.id === "heroBackground" && slot.override) ?? null);
  paint("editorialMaterial", firstOverride(resolved, "sectionIllustration"));
  paint("decisionBackground", resolved.find((slot) => slot.slot.id === "closingHero" && slot.override) ?? null);
  paint("returnPolicyVisual", resolved.find((slot) => slot.slot.id === "guaranteeBadge" && slot.override) ?? null);
  paint("featureVisual", firstOverride(resolved, "featureImage"));

  let ingredientVisuals: Array<{ factValue: string; src: string }> | null = null;
  for (const slot of resolved.filter((item) => item.slot.role === "ingredientImage" && item.override)) {
    const current: Array<{ factValue: string; src: string }> = ingredientVisuals ?? [...(assets.ingredientVisuals ?? [])];
    const key = factKey(slot.slot.label);
    const src = presentationSrc(slot.effective.src);
    const index = current.findIndex((item) => factKey(item.factValue) === key);
    let mutated = false;
    if (!src) {
      if (index >= 0) {
        current.splice(index, 1);
        mutated = true;
      }
    } else if (index >= 0) {
      if (current[index]?.src !== src) {
        current[index] = { factValue: current[index]?.factValue ?? slot.slot.label, src };
        mutated = true;
      }
    } else {
      current.push({ factValue: slot.slot.label, src });
      mutated = true;
    }
    if (mutated) ingredientVisuals = current;
  }

  if (nextPage === page && !visualsChanged && !ingredientVisuals) return { page, assets };
  return {
    page: nextPage,
    assets: {
      ...assets,
      visualAssets: visualsChanged ? visualAssets : assets.visualAssets,
      ...(ingredientVisuals ? { ingredientVisuals } : {}),
    },
  };
}

export function withBuilderMedia(campaign: Campaign, assets: PresellRenderAssets = NO_PRESELL_RENDER_ASSETS): { campaign: Campaign; assets: PresellRenderAssets } {
  const assignments = assignmentsFrom(campaign.id);
  if (assignments.length === 0) return { campaign, assets };
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) return { campaign, assets };
  const presented = presentMedia(page, assets, assignments);
  if (presented.page === page && presented.assets === assets) return { campaign, assets };
  return {
    campaign: presented.page === page ? campaign : { ...campaign, pageComposition: serializePresellPage(presented.page) },
    assets: presented.assets,
  };
}

export function applyMediaAssets(campaign: Campaign, assets: PresellRenderAssets): PresellRenderAssets {
  return withBuilderMedia(campaign, assets).assets;
}
