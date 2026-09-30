/**
 * Layout override engine.
 * Generated layout, then layout overrides, then the effective layout.
 * Facts, copy, theme, and media are not part of this module.
 */

import {
  LP_SECTION_TARGETS,
  createOverrideAudit,
  resolveLandingPage,
  type LandingPageDocument,
  type LpSectionTarget,
} from "@/lib/lp-builder/index";

export const LAYOUT_SECTIONS = [
  "hero",
  "features",
  "ingredients",
  "pricing",
  "guarantee",
  "faq",
  "warnings",
  "manufacturer",
  "shipping",
  "returns",
  "testimonials",
  "bonus",
  "footer",
  "closingCta",
  "disclosure",
  "navigation",
] as const;

export type LayoutSectionId = (typeof LAYOUT_SECTIONS)[number];

export const LAYOUT_LABELS: Record<LayoutSectionId, string> = {
  hero: "Hero",
  features: "Features",
  ingredients: "Ingredients",
  pricing: "Pricing",
  guarantee: "Guarantee",
  faq: "FAQ",
  warnings: "Warnings",
  manufacturer: "Manufacturer",
  shipping: "Shipping",
  returns: "Returns",
  testimonials: "Testimonials",
  bonus: "Bonus",
  footer: "Footer",
  closingCta: "Closing CTA",
  disclosure: "Disclosure",
  navigation: "Navigation",
};

export const MANDATORY_SECTIONS = ["hero", "disclosure", "footer"] as const;

export const LAYOUT_PRESETS = ["generated", "editorial", "sales", "compact", "longForm"] as const;

export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

export const LAYOUT_SELECTORS: Record<LayoutSectionId, string> = {
  hero: ".vm-hero",
  features: "[data-section-id=\"features\"]",
  ingredients: "[data-section-id=\"ingredients\"]",
  pricing: "[data-section-id=\"pricing\"]",
  guarantee: "[data-section-id=\"guarantee\"]",
  faq: "[data-section-id=\"faq\"]",
  warnings: "[data-section-id=\"considerations\"]",
  manufacturer: "[data-layout-section=\"manufacturer\"]",
  shipping: "[data-section-id=\"shipping\"]",
  returns: "[data-section-id=\"returns\"]",
  testimonials: "[data-layout-section=\"testimonials\"]",
  bonus: "[data-layout-section=\"bonus\"]",
  footer: ".vm-footer",
  closingCta: ".vm-close",
  disclosure: ".vm-disclosure-bar",
  navigation: ".vm-nav",
};

export type LayoutSectionState = {
  id: string;
  sectionId: LayoutSectionId;
  label: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  priority: number;
  pinned: boolean;
  locked: boolean;
  futureCompatible: boolean;
  duplicate: boolean;
};

export type LayoutAssignment = {
  sectionKey: string;
  sectionId: LayoutSectionId;
  visible: boolean;
  collapsed: boolean;
  order: number;
  priority: number;
  pinned: boolean;
  locked: boolean;
  futureCompatible: boolean;
  duplicate: boolean;
};

export type LayoutWarning = {
  sectionKey: string;
  code: "mandatory-hidden";
  message: string;
};

export type ResolvedLayout = {
  generated: LayoutSectionState[];
  sections: LayoutSectionState[];
  warnings: LayoutWarning[];
  document: LandingPageDocument;
};

const PRESET_ORDER: Record<Exclude<LayoutPreset, "generated">, readonly LayoutSectionId[]> = {
  editorial: ["disclosure", "navigation", "hero", "features", "ingredients", "warnings", "manufacturer", "guarantee", "faq", "shipping", "returns", "footer", "closingCta", "pricing", "bonus", "testimonials"],
  sales: ["hero", "pricing", "bonus", "guarantee", "closingCta", "faq", "features", "testimonials", "footer", "disclosure", "navigation", "ingredients", "warnings", "manufacturer", "shipping", "returns"],
  compact: ["hero", "features", "pricing", "closingCta", "disclosure", "footer", "navigation", "ingredients", "guarantee", "faq", "warnings", "manufacturer", "shipping", "returns", "testimonials", "bonus"],
  longForm: ["disclosure", "navigation", "hero", "features", "ingredients", "manufacturer", "warnings", "shipping", "returns", "guarantee", "faq", "testimonials", "bonus", "pricing", "closingCta", "footer"],
};

const PRESET_COLLAPSE: Record<Exclude<LayoutPreset, "generated">, readonly LayoutSectionId[]> = {
  editorial: ["pricing", "bonus", "testimonials"],
  sales: ["ingredients", "manufacturer", "shipping", "returns", "warnings"],
  compact: ["ingredients", "guarantee", "faq", "warnings", "manufacturer", "shipping", "returns", "testimonials", "bonus", "navigation"],
  longForm: [],
};

export function isLayoutSection(value: string): value is LayoutSectionId {
  return (LAYOUT_SECTIONS as readonly string[]).includes(value);
}

export function isLayoutPreset(value: string): value is LayoutPreset {
  return (LAYOUT_PRESETS as readonly string[]).includes(value);
}

export function isLayoutKey(value: string): boolean {
  const [base, copy] = value.split("~");
  if (!base || !isLayoutSection(base)) return false;
  return copy === undefined || /^[1-9][0-9]*$/.test(copy);
}

function targetFor(sectionId: LayoutSectionId): LpSectionTarget {
  if (sectionId === "closingCta") return "cta";
  if ((LP_SECTION_TARGETS as readonly string[]).includes(sectionId)) return sectionId as LpSectionTarget;
  return "footer";
}

export function buildGeneratedLayout(onPage: readonly string[] = []): LayoutSectionState[] {
  const present = new Set(onPage);
  return LAYOUT_SECTIONS.map((sectionId, order) => ({
    id: sectionId,
    sectionId,
    label: LAYOUT_LABELS[sectionId],
    visible: true,
    collapsed: false,
    order,
    priority: 0,
    pinned: false,
    locked: false,
    futureCompatible: sectionId === "testimonials" || (onPage.length > 0 && !present.has(sectionId)),
    duplicate: false,
  }));
}

function sameState(generated: LayoutSectionState, section: LayoutSectionState): boolean {
  return generated.visible === section.visible
    && generated.collapsed === section.collapsed
    && generated.order === section.order
    && generated.priority === section.priority
    && generated.pinned === section.pinned
    && generated.locked === section.locked
    && generated.futureCompatible === section.futureCompatible
    && !section.duplicate;
}

export function assignmentsFrom(generated: readonly LayoutSectionState[], sections: readonly LayoutSectionState[]): LayoutAssignment[] {
  const generatedById = new Map(generated.map((section) => [section.id, section]));
  return sections.flatMap((section) => {
    const source = generatedById.get(section.id);
    if (source && sameState(source, section)) return [];
    return [{
      sectionKey: section.id,
      sectionId: section.sectionId,
      visible: section.visible,
      collapsed: section.collapsed,
      order: section.order,
      priority: section.priority,
      pinned: section.pinned,
      locked: section.locked,
      futureCompatible: section.futureCompatible,
      duplicate: section.duplicate,
    }];
  });
}

function applyAssignment(base: LayoutSectionState, assignment: LayoutAssignment): LayoutSectionState {
  return {
    ...base,
    id: assignment.sectionKey,
    sectionId: assignment.sectionId,
    label: assignment.duplicate ? `${LAYOUT_LABELS[assignment.sectionId]} copy` : LAYOUT_LABELS[assignment.sectionId],
    visible: assignment.visible,
    collapsed: assignment.collapsed,
    order: assignment.order,
    priority: assignment.priority,
    pinned: assignment.pinned,
    locked: assignment.locked,
    futureCompatible: assignment.futureCompatible,
    duplicate: assignment.duplicate,
  };
}

export function effectiveLayout(generated: readonly LayoutSectionState[], assignments: readonly LayoutAssignment[]): LayoutSectionState[] {
  const byKey = new Map(assignments.map((row) => [row.sectionKey, row]));
  const sections = generated.map((section) => {
    const assignment = byKey.get(section.id);
    return assignment ? applyAssignment(section, assignment) : { ...section };
  });
  for (const assignment of assignments) {
    if (!assignment.duplicate || sections.some((section) => section.id === assignment.sectionKey)) continue;
    sections.push(applyAssignment({
      ...generated.find((section) => section.sectionId === assignment.sectionId) ?? buildGeneratedLayout()[0],
      id: assignment.sectionKey,
      duplicate: true,
    }, assignment));
  }
  return sections.sort((a, b) => a.order - b.order || b.priority - a.priority || a.id.localeCompare(b.id));
}

function layoutDocument(sections: readonly LayoutSectionState[]): LandingPageDocument {
  const base = sections.filter((section) => !section.duplicate);
  return {
    sections: base.map((section) => ({
      id: section.sectionId,
      target: targetFor(section.sectionId),
      heading: section.label,
      visible: true,
      components: [],
    })),
    theme: { colors: {}, typography: {}, spacing: {} },
    assets: [],
    layout: { width: "", alignment: "start" },
  };
}

export function resolveLayout(input: {
  generated: readonly LayoutSectionState[];
  assignments: readonly LayoutAssignment[];
}): ResolvedLayout {
  const sections = effectiveLayout(input.generated, input.assignments);
  const warnings: LayoutWarning[] = sections
    .filter((section) => !section.visible && (MANDATORY_SECTIONS as readonly string[]).includes(section.sectionId))
    .map((section) => ({
      sectionKey: section.id,
      code: "mandatory-hidden" as const,
      message: `${section.label} is a required section and is hidden.`,
    }));
  const generatedDocument = layoutDocument(input.generated);
  const generatedVisible = new Map(input.generated.map((section) => [section.sectionId, section.visible]));
  const visibility = sections.flatMap((section) => {
    if (section.duplicate || section.visible === generatedVisible.get(section.sectionId)) return [];
    return [{
      ...createOverrideAudit({ actor: "admin", at: "1970-01-01T00:00:00.000Z", version: 1 }),
      sectionId: section.sectionId,
      visible: section.visible,
    }];
  });
  const generatedOrder = input.generated.map((section) => section.sectionId);
  const effectiveOrder = sections.filter((section) => !section.duplicate).map((section) => section.sectionId);
  const orderChanged = effectiveOrder.join("|") !== generatedOrder.join("|");
  const document = resolveLandingPage(generatedDocument, {
    ...(visibility.length > 0 ? { visibility } : {}),
    ...(orderChanged ? { order: { ...createOverrideAudit({ actor: "admin", at: "1970-01-01T00:00:00.000Z", version: 1 }), sectionIds: effectiveOrder } } : {}),
  });
  return { generated: input.generated.map((section) => ({ ...section })), sections, warnings, document };
}

function renumber(sections: readonly LayoutSectionState[]): LayoutSectionState[] {
  return sections.map((section, order) => ({ ...section, order }));
}

export function moveSection(sections: readonly LayoutSectionState[], sectionKey: string, direction: -1 | 1): LayoutSectionState[] {
  const ordered = [...sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const index = ordered.findIndex((section) => section.id === sectionKey);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered.map((section) => ({ ...section }));
  if (ordered[index]?.locked || ordered[nextIndex]?.locked) return ordered.map((section) => ({ ...section }));
  const swapped = [...ordered];
  const [moved] = swapped.splice(index, 1);
  swapped.splice(nextIndex, 0, moved);
  return renumber(swapped);
}

export function insertSection(sections: readonly LayoutSectionState[], sectionKey: string, targetKey: string, place: "before" | "after"): LayoutSectionState[] {
  const ordered = [...sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const from = ordered.findIndex((section) => section.id === sectionKey);
  const target = ordered.findIndex((section) => section.id === targetKey);
  if (from < 0 || target < 0 || from === target) return ordered.map((section) => ({ ...section }));
  if (ordered[from]?.locked || ordered[target]?.locked) return ordered.map((section) => ({ ...section }));
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  const targetIndex = next.findIndex((section) => section.id === targetKey);
  next.splice(place === "before" ? targetIndex : targetIndex + 1, 0, moved);
  return renumber(next);
}

export function withFlag(sections: readonly LayoutSectionState[], sectionKey: string, patch: Partial<Pick<LayoutSectionState, "visible" | "collapsed" | "pinned" | "locked" | "priority" | "futureCompatible">>): LayoutSectionState[] {
  return sections.map((section) => section.id === sectionKey ? { ...section, ...patch } : { ...section });
}

export function duplicateSection(sections: readonly LayoutSectionState[], sectionKey: string): LayoutSectionState[] {
  const source = sections.find((section) => section.id === sectionKey);
  if (!source || source.locked) return sections.map((section) => ({ ...section }));
  const copies = sections.filter((section) => section.sectionId === source.sectionId && section.duplicate).length + 2;
  const copy: LayoutSectionState = {
    ...source,
    id: `${source.sectionId}~${copies}`,
    label: `${LAYOUT_LABELS[source.sectionId]} copy`,
    duplicate: true,
    locked: false,
    pinned: false,
    order: source.order + 0.5,
  };
  return renumber([...sections, copy].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
}

export function applyPreset(generated: readonly LayoutSectionState[], current: readonly LayoutSectionState[], preset: LayoutPreset): LayoutSectionState[] {
  if (preset === "generated") return generated.map((section) => ({ ...section }));
  const order = PRESET_ORDER[preset];
  const collapse = new Set(PRESET_COLLAPSE[preset]);
  const held = new Map(current.filter((section) => section.pinned || section.locked).map((section) => [section.id, section]));
  const base = generated.map((section) => {
    const kept = held.get(section.id);
    if (kept) return { ...kept };
    return {
      ...section,
      order: order.indexOf(section.sectionId),
      collapsed: collapse.has(section.sectionId),
      visible: true,
    };
  });
  const duplicates = current.filter((section) => section.duplicate).map((section) => ({ ...section }));
  return renumber([...base, ...duplicates].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
}

export function layoutStyle(resolved: ResolvedLayout): string {
  const generatedOrder = resolved.generated.map((section) => section.sectionId).join("|");
  const effectiveOrder = resolved.sections.filter((section) => !section.duplicate).map((section) => section.sectionId).join("|");
  const rules: string[] = [];
  if (generatedOrder !== effectiveOrder) {
    rules.push(".lp-layout .vm-page { display: flex; flex-direction: column; align-items: stretch; }");
    rules.push(".lp-layout .vm-page > * { width: 100%; }");
    for (const section of resolved.sections) {
      if (section.duplicate) continue;
      rules.push(`.lp-layout ${LAYOUT_SELECTORS[section.sectionId]} { order: ${section.order}; }`);
    }
  }
  for (const section of resolved.sections) {
    if (section.duplicate) continue;
    const selector = `.lp-layout ${LAYOUT_SELECTORS[section.sectionId]}`;
    if (!section.visible) rules.push(`${selector} { display: none !important; }`);
    else if (section.collapsed) rules.push(`${selector} { max-height: 4.5rem; overflow: hidden; }`);
  }
  return rules.join("\n");
}
