/**
 * In-memory presentation text attached to a rendered page.
 * Absent means the generated landing page is shown as stored.
 */

export const BUILDER_GROUPS = [
  "hero",
  "features",
  "ingredients",
  "pricing",
  "faq",
  "guarantee",
  "warnings",
  "manufacturer",
  "footer",
] as const;

export type BuilderGroup = (typeof BUILDER_GROUPS)[number];

export type RenderedBuilderContent = {
  disclosure?: string;
  footer?: string;
  heroDisclaimer?: string;
  closingCta?: string;
  pricingCta?: string;
  navLabels?: Record<string, string>;
  pricingTitle?: string;
  pricing?: Array<{ title: string; description: string }>;
  shipping?: string;
  returns?: string;
  manufacturer?: string;
  warnings?: string;
};

export function renderedBuilderContent(page: object): RenderedBuilderContent | undefined {
  const value = (page as { builderContent?: unknown }).builderContent;
  if (!value || typeof value !== "object") return undefined;
  return value as RenderedBuilderContent;
}
