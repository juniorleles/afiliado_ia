/**
 * Deterministic landing-page resolution.
 * Generated content is copied first. An override replaces only the field it carries.
 */

import type {
  LandingPageDocument,
  LandingPageOverride,
  LandingPageSection,
  ThemeOverride,
} from "@/lib/lp-builder/types";

function hasEntries(value: Record<string, string> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function themeHasPayload(theme: ThemeOverride | undefined): boolean {
  if (!theme) return false;
  return hasEntries(theme.colors) || hasEntries(theme.typography) || hasEntries(theme.spacing);
}

function layoutHasPayload(layout: LandingPageOverride["layout"]): boolean {
  if (!layout) return false;
  return layout.width !== undefined || layout.alignment !== undefined;
}

function hasPayload(overrides: LandingPageOverride): boolean {
  if ((overrides.sections ?? []).some((item) => item.heading !== undefined)) return true;
  if ((overrides.components ?? []).some((item) => item.text !== undefined || item.items !== undefined || item.visible !== undefined)) {
    return true;
  }
  if ((overrides.assets ?? []).some((item) => item.src !== undefined || item.alt !== undefined)) return true;
  if (layoutHasPayload(overrides.layout)) return true;
  if (themeHasPayload(overrides.theme)) return true;
  if ((overrides.visibility ?? []).length > 0) return true;
  if ((overrides.order?.sectionIds.length ?? 0) > 0) return true;
  return false;
}

function mergeRecords(base: Record<string, string>, patch: Record<string, string> | undefined): void {
  if (!patch) return;
  for (const [key, value] of Object.entries(patch)) base[key] = value;
}

function applySectionHeadings(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const headings = new Map<string, string>();
  for (const override of overrides.sections ?? []) {
    if (override.heading !== undefined) headings.set(override.sectionId, override.heading);
  }
  for (const section of page.sections) {
    const heading = headings.get(section.id);
    if (heading !== undefined) section.heading = heading;
  }
}

function applyComponents(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const byId = new Map((overrides.components ?? []).map((override) => [override.componentId, override]));
  for (const section of page.sections) {
    for (const component of section.components) {
      const override = byId.get(component.id);
      if (!override) continue;
      if (override.text !== undefined) component.text = override.text;
      if (override.items !== undefined) component.items = override.items.map((item) => ({ ...item }));
      if (override.visible !== undefined) component.visible = override.visible;
    }
  }
}

function applyAssets(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const byId = new Map((overrides.assets ?? []).map((override) => [override.assetId, override]));
  for (const asset of page.assets) {
    const override = byId.get(asset.id);
    if (!override) continue;
    if (override.src !== undefined) asset.src = override.src;
    if (override.alt !== undefined) asset.alt = override.alt;
  }
}

function applyTheme(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const theme = overrides.theme;
  if (!theme) return;
  mergeRecords(page.theme.colors, theme.colors);
  mergeRecords(page.theme.typography, theme.typography);
  mergeRecords(page.theme.spacing, theme.spacing);
}

function applyLayout(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const layout = overrides.layout;
  if (!layout) return;
  if (layout.width !== undefined) page.layout.width = layout.width;
  if (layout.alignment !== undefined) page.layout.alignment = layout.alignment;
}

function applyVisibility(page: LandingPageDocument, overrides: LandingPageOverride): void {
  const flags = new Map<string, boolean>();
  for (const override of overrides.visibility ?? []) flags.set(override.sectionId, override.visible);
  for (const section of page.sections) {
    const visible = flags.get(section.id);
    if (visible !== undefined) section.visible = visible;
  }
}

function applyOrder(sections: LandingPageSection[], sectionIds: string[]): LandingPageSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const used = new Set<string>();
  const next: LandingPageSection[] = [];
  for (const id of sectionIds) {
    const section = byId.get(id);
    if (!section || used.has(id)) continue;
    used.add(id);
    next.push(section);
  }
  for (const section of sections) {
    if (!used.has(section.id)) next.push(section);
  }
  return next;
}

/**
 * Generated content, then LP overrides, then the effective page.
 * Missing overrides are skipped. The input page is not mutated.
 */
export function resolveLandingPage(generated: LandingPageDocument, overrides: LandingPageOverride = {}): LandingPageDocument {
  const effective = structuredClone(generated);
  if (!hasPayload(overrides)) return effective;
  applySectionHeadings(effective, overrides);
  applyComponents(effective, overrides);
  applyAssets(effective, overrides);
  applyTheme(effective, overrides);
  applyLayout(effective, overrides);
  applyVisibility(effective, overrides);
  if ((overrides.order?.sectionIds.length ?? 0) > 0) {
    effective.sections = applyOrder(effective.sections, overrides.order?.sectionIds ?? []);
  }
  return effective;
}
