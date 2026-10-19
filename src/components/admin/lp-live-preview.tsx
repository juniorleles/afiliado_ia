"use client";

import { useEffect, useRef } from "react";
import { BUILDER_GROUPS, type BuilderGroup } from "@/lib/builder-content";
import {
  PREVIEW_VIEWPORTS,
  PREVIEW_VIEWPORT_WIDTH,
  type PreviewView,
  type PreviewViewport,
  type LivePreviewResult,
} from "@/lib/lp-builder/live-preview";
import type { ResolvedContentField } from "@/lib/lp-builder/content";
import { completeCopy, dedupePresentedLines, isPendingHealthClaim, stripFactLabel } from "@/lib/landing-composer/present";
import { showcaseFromBuilderFields, presellShowcaseCta } from "@/lib/product-showcase/adapt";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import { AFFILIATE_DISCLOSURE_TEXT, PUBLIC_FOOTER_LINKS, TRUST_EDITORIAL } from "@/lib/public-site";
import "@/app/presell-design.css";
import "@/app/product-showcase.css";

const GROUP_LABELS: Record<BuilderGroup, string> = {
  hero: "Hero",
  features: "Features",
  ingredients: "Ingredients",
  pricing: "Pricing",
  faq: "FAQ",
  guarantee: "Guarantee",
  warnings: "Warnings",
  manufacturer: "Manufacturer",
  footer: "Footer",
};

const DOCUMENT_HEADING: Record<string, string> = {
  benefits: "Product overview",
  ingredients: "Ingredients",
  solution: "Product details",
  guarantee: "Guarantee",
  problem: "Important information",
  faq: "Questions",
};

const DOCUMENT_ORDER = ["benefits", "ingredients", "solution", "guarantee", "problem", "faq"];

function DocumentPreview({
  fields,
  showHighlights,
  flashSection,
}: {
  fields: ResolvedContentField[];
  showHighlights: boolean;
  flashSection: BuilderGroup | null;
}) {
  const headline = fields.find((field) => field.id === "hero.headline");
  const description = fields.find((field) => field.id === "hero.subheadline");
  const benefits = fields.find((field) => field.id === "document.benefits")?.effective ?? "";
  const ingredients = fields.find((field) => field.id === "document.ingredients")?.effective ?? "";
  const sections = fields.filter((field) => field.id.startsWith("document.")).sort((left, right) => {
    const leftOrder = DOCUMENT_ORDER.indexOf(left.id.slice("document.".length));
    const rightOrder = DOCUMENT_ORDER.indexOf(right.id.slice("document.".length));
    return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
  });
  const benefitLines = dedupePresentedLines("benefits", benefits.split("\n"), [], ingredients.split("\n"));
  const neutralLead = completeCopy(description?.effective ?? "").filter((line) => !isPendingHealthClaim(line) && line.length <= 160);
  const formatLead = benefitLines.find((line) => /\b(capsule|formula|bottle|serving|mushroom)\b/i.test(line) && line.length <= 90);
  const lead = neutralLead[0] ?? formatLead ?? "";
  const leadKey = lead.toLowerCase();
  return (
    <div className="presell-canvas" data-visual-theme="PREMIUM">
      <article className="ps-doc" data-landing-presentation="document">
        <div className="ps-shell ps-doc-shell">
          {headline?.effective ? <h1 className="ps-doc-title" data-preview-field={headline.id}>{headline.effective}</h1> : null}
          {lead ? <p className="ps-doc-lead" data-preview-field={description?.id}>{lead}</p> : null}
          {sections.map((field) => {
            const sectionId = field.id.slice("document.".length);
            const lines = dedupePresentedLines(sectionId, field.effective.split("\n"), benefits.split("\n"), ingredients.split("\n")).filter((line) => {
              if (sectionId !== "benefits" || leadKey.length < 3) return true;
              const key = line.toLowerCase();
              return key !== leadKey && !leadKey.includes(key) && !key.includes(leadKey);
            });
            if (lines.length === 0) return null;
            const heading = DOCUMENT_HEADING[sectionId];
            const changed = showHighlights && field.effective !== field.generated;
            return (
              <section key={field.id} className="ps-doc-section" data-preview-section={field.group} data-flash={flashSection === field.group ? "1" : undefined}>
                {heading ? <h2>{heading}</h2> : null}
                <ul className={sectionId === "ingredients" ? "ps-doc-grid ps-doc-ingredients" : "ps-doc-grid"}>
                  {lines.map((line) => (
                    <li key={line} className="ps-doc-card" data-preview-field={field.id} style={changed ? { outline: "2px solid #d97706" } : undefined}>{stripFactLabel(line)}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function PreviewDocument({
  fields,
  showHighlights,
  flashSection,
}: {
  fields: ResolvedContentField[];
  showHighlights: boolean;
  flashSection: BuilderGroup | null;
}) {
  if (fields.some((field) => field.id.startsWith("document."))) {
    return <DocumentPreview fields={fields} showHighlights={showHighlights} flashSection={flashSection} />;
  }
  return (
    <article className="space-y-8 px-6 py-8 text-zinc-900">
      {BUILDER_GROUPS.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        if (groupFields.length === 0) return null;
        const flashing = flashSection === group;
        return (
          <section
            key={group}
            data-preview-section={group}
            className={`scroll-mt-4 space-y-2 ${flashing ? "rounded-md ring-2 ring-emerald-500" : ""}`}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{GROUP_LABELS[group]}</h2>
            {groupFields.map((field) => {
              const changed = showHighlights && field.effective !== field.generated;
              const text = field.effective;
              if (!text) return null;
              const className = changed ? "rounded-sm bg-amber-100 px-1" : undefined;
              if (field.kind === "headline") {
                return (
                  <h1 key={field.id} data-preview-field={field.id} className={`text-3xl font-semibold leading-tight ${className ?? ""}`}>
                    {text}
                  </h1>
                );
              }
              if (field.kind === "cta") {
                return (
                  <p key={field.id}>
                    <span data-preview-field={field.id} className={`inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white ${className ?? ""}`}>
                      {text}
                    </span>
                  </p>
                );
              }
              if (field.kind === "title" || field.id.endsWith(".title") || field.id.endsWith(".question")) {
                return (
                  <h3 key={field.id} data-preview-field={field.id} className={`text-lg font-medium ${className ?? ""}`}>
                    {text}
                  </h3>
                );
              }
              return (
                <p key={field.id} data-preview-field={field.id} className={`whitespace-pre-wrap leading-relaxed ${className ?? ""}`}>
                  {text}
                </p>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

function ShowcaseBuilderPreview({
  fields,
  hopAllowed,
  siteName,
  healthDisclaimer,
}: {
  fields: ResolvedContentField[];
  hopAllowed: boolean;
  siteName: string;
  healthDisclaimer: string | null;
}) {
  const label = fields.find((field) => field.id === "hero.cta")?.effective.trim() ?? "";
  const model = showcaseFromBuilderFields(fields, {
    siteName,
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
    cta: null,
  });
  const cta = hopAllowed ? presellShowcaseCta(label, "https://hop.example", "presell") : null;
  return (
    <ProductShowcasePremiumV1
      model={{ ...model, cta }}
      labHref="#lp-live-preview"
      showLabBar={false}
      ctaSlot={cta ? <span className="psp-cta">{cta.label}</span> : null}
    />
  );
}

export function LivePreviewPane({
  effective,
  generated,
  view,
  viewport,
  showHighlights,
  flashSection,
  refreshToken,
  presentation,
  hopAllowed,
  siteName,
  healthDisclaimer,
  onView,
  onViewport,
  onHighlights,
  onRefresh,
  onReset,
}: {
  effective: LivePreviewResult;
  generated: LivePreviewResult;
  view: PreviewView;
  viewport: PreviewViewport;
  showHighlights: boolean;
  flashSection: BuilderGroup | null;
  refreshToken: number;
  presentation: "LEGACY" | "PRODUCT_SHOWCASE_PREMIUM_V1";
  hopAllowed: boolean;
  siteName: string;
  healthDisclaimer: string | null;
  onView: (view: PreviewView) => void;
  onViewport: (viewport: PreviewViewport) => void;
  onHighlights: (value: boolean) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const errorCount = Object.keys(effective.errors).length;

  useEffect(() => {
    if (!flashSection) return;
    const node = scroller.current?.querySelector(`[data-preview-section="${flashSection}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [flashSection, refreshToken, view]);

  const width = PREVIEW_VIEWPORT_WIDTH[viewport];
  const frames = view === "compare"
    ? [
        { label: "Generated", result: generated },
        { label: "Effective", result: effective },
      ]
    : [{ label: view === "generated" ? "Generated" : "Effective", result: view === "generated" ? generated : effective }];

  return (
    <div className="space-y-3 xl:sticky xl:top-4">
      <div className="flex flex-wrap gap-2">
        {PREVIEW_VIEWPORTS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={viewport === item}
            onClick={() => onViewport(item)}
            className={`rounded-md border px-2 py-1 text-xs capitalize ${viewport === item ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRefresh} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Refresh preview
        </button>
        <button type="button" onClick={onReset} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Reset preview
        </button>
        <button type="button" aria-pressed={view === "compare"} onClick={() => onView(view === "compare" ? "effective" : "compare")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Compare generated vs effective
        </button>
        <button type="button" aria-pressed={view === "generated"} onClick={() => onView("generated")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Toggle generated
        </button>
        <button type="button" aria-pressed={view === "effective"} onClick={() => onView("effective")} className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200">
          Toggle effective
        </button>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={showHighlights} onChange={(event) => onHighlights(event.target.checked)} />
          Show override highlights
        </label>
      </div>
      {errorCount > 0 ? (
        <p className="text-xs text-amber-200" role="status">
          The preview is still showing the last valid text.
        </p>
      ) : null}
      <div ref={scroller} data-live-preview="1" data-preview-viewport={viewport} className="max-h-[80vh] overflow-auto rounded-md border border-zinc-700 bg-zinc-900 p-3">
        <div className={view === "compare" ? "flex gap-3" : ""}>
          {frames.map((frame) => (
            <div key={`${frame.label}-${refreshToken}`} style={{ width }} className="shrink-0 bg-white">
              {view === "compare" ? <p className="px-6 pt-4 text-xs uppercase tracking-wide text-zinc-500">{frame.label}</p> : null}
              {presentation === "PRODUCT_SHOWCASE_PREMIUM_V1" ? (
                <ShowcaseBuilderPreview fields={frame.result.fields} hopAllowed={hopAllowed} siteName={siteName} healthDisclaimer={healthDisclaimer} />
              ) : (
                <PreviewDocument fields={frame.result.fields} showHighlights={showHighlights && frame.label !== "Generated"} flashSection={flashSection} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
