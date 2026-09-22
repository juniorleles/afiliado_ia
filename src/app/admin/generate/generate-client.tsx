"use client";

import { useState, type ReactNode } from "react";
import type { LintedVariant } from "@/lib/ai/generate-variants";
import type { CampaignInput } from "@/lib/campaigns";
import type { FactConfidence, ProductFacts } from "@/lib/product-facts";
import {
  applyManualFacts,
  assessImportQuality,
  emptyProductFacts,
  listAsTextarea,
  provenanceLabel,
  snippetsForField,
} from "@/lib/product-facts";
import { generateVariantsAction, importProductAction, getImportProgressAction, cancelImportAction, researchAndRecommendAction, generateRecommendedLpAction } from "./actions";
import { CampaignForm } from "@/app/admin/campaign-form";
import { createCampaignAction } from "@/app/admin/actions";
import { slugify } from "@/lib/slug";
import type { PublicationGate } from "@/lib/policy-linter";
import {
  authorizedCopyFromVariant,
  composePresellPage,
  includedComponentLabels,
  PAGE_TEMPLATES,
  reconstructPageBody,
  serializePresellPage,
  TEMPLATE_META,
  validateComposedPage,
  type PageTemplateId,
  type PresellPage,
} from "@/lib/presell-page";
import { CampaignTemplate } from "@/components/campaign-template";
import { WebDiscoveryPanel } from "@/components/admin/web-discovery-panel";
import { MarketRecommendationPanel, MarketResearchPanel } from "@/components/admin/market-recommendation-panel";
import type { Campaign } from "@/lib/campaigns";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { StrategyRecommendation } from "@/lib/strategy/types";

type Step =
  | { kind: "input" }
  | { kind: "facts"; facts: ProductFacts }
  | { kind: "loading"; facts: ProductFacts }
  | {
      kind: "recommendation";
      facts: ProductFacts;
      affiliateUrl: string;
      research: MarketResearchReport;
      recommendation: StrategyRecommendation;
      showResearch?: boolean;
    }
  | {
      kind: "recommended-lp";
      facts: ProductFacts;
      affiliateUrl: string;
      research: MarketResearchReport;
      recommendation: StrategyRecommendation;
      variant: LintedVariant;
      previewUrl: string;
      previewPath: string;
      usedFallback: boolean;
      blocked: boolean;
    }
  | {
      kind: "picking";
      variants: LintedVariant[];
      facts: ProductFacts;
      affiliateUrl: string;
      expanded: number | null;
    }
  | {
      kind: "template";
      variant: LintedVariant;
      facts: ProductFacts;
      affiliateUrl: string;
    }
  | {
      kind: "compose";
      variant: LintedVariant;
      facts: ProductFacts;
      affiliateUrl: string;
      page: PresellPage;
      viewport: "desktop" | "mobile";
    }
  | { kind: "editing"; chosen: CampaignInput; facts: ProductFacts };

const GATE_CLASS: Record<PublicationGate, string> = {
  READY: "text-emerald-400",
  REVIEW_REQUIRED: "text-amber-400",
  BLOCKED: "text-red-400",
};

export function GenerateClient() {
  const [step, setStep] = useState<Step>({ kind: "input" });
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importedFacts, setImportedFacts] = useState<ProductFacts | null>(null);
  const [allowManualLastResort, setAllowManualLastResort] = useState(false);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  async function handleImport() {
    if (!sourceUrl.trim()) {
      setImportError("Cole uma URL de produto primeiro.");
      return;
    }
    setImportError(null);
    setAllowManualLastResort(false);
    setImportedFacts(null);
    setTimedOut(false);
    setImporting(true);
    setImportStatus("Checking primary source...");
    const operatorName = productName.trim();
    const importId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `imp_${Date.now()}`;
    setActiveImportId(importId);
    const poll = window.setInterval(() => {
      void getImportProgressAction(importId).then((progress) => {
        if (progress?.stage) setImportStatus(progress.stage);
      });
    }, 400);
    try {
      const result = await importProductAction({
        url: sourceUrl.trim(),
        operatorProductName: operatorName,
        importId,
      });
      if (!result.ok) {
        setImportStatus(null);
        setImportError(result.error);
        setImportedFacts(null);
        setAllowManualLastResort(Boolean(result.discoveryAttempted || result.needsProductName));
        return;
      }
      const facts = operatorName ? { ...result.facts, productName: operatorName } : result.facts;
      const discovery = facts.webDiscovery;
      const timed =
        discovery?.outcome === "TIMED_OUT" ||
        discovery?.outcome === "CANCELLED" ||
        discovery?.outcome === "SEARCH_TIMEOUT";
      setTimedOut(Boolean(timed));
      if (discovery?.triggered) {
        const messages = discovery.operatorMessages?.length ? discovery.operatorMessages : [discovery.message];
        setImportStatus(messages[messages.length - 1] || discovery.message);
      } else {
        setImportStatus(null);
      }
      if (facts.productName) setProductName(facts.productName);
      setImportedFacts(facts);
      const accepted = discovery?.acceptedCount || 0;
      setAllowManualLastResort(Boolean(discovery?.triggered && accepted === 0));
      if (!timed) {
        setStep({
          kind: "facts",
          facts: {
            ...facts,
            productName: facts.productName || operatorName,
            sourceUrl: facts.sourceUrl || sourceUrl.trim(),
          },
        });
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
      setImportedFacts(null);
    } finally {
      window.clearInterval(poll);
      setImporting(false);
      setActiveImportId(null);
    }
  }

  async function handleCancelImport() {
    if (!activeImportId) return;
    await cancelImportAction(activeImportId);
    setImportStatus("Cancelling…");
  }

  function goToFacts(manual: boolean) {
    setError(null);
    if (!productName.trim()) {
      setError("Product name é obrigatório.");
      return;
    }
    if (!affiliateUrl.trim()) {
      setError("URL de afiliado é obrigatória.");
      return;
    }
    const base =
      !manual && importedFacts
        ? {
            ...importedFacts,
            productName: productName.trim(),
            sourceUrl: sourceUrl.trim() || importedFacts.sourceUrl,
          }
        : emptyProductFacts(productName.trim(), sourceUrl.trim(), "MANUAL");
    setStep({ kind: "facts", facts: { ...base, productName: productName.trim() } });
  }

  async function handleGenerate(facts: ProductFacts) {
    if (!affiliateUrl.trim()) {
      setError("URL de afiliado é obrigatória.");
      return;
    }
    setError(null);
    setStep({ kind: "loading", facts });
    const rec = await researchAndRecommendAction(facts);
    if (!rec.ok) {
      setError(rec.error);
      setStep({ kind: "facts", facts });
      return;
    }
    setStep({
      kind: "recommendation",
      facts,
      affiliateUrl: affiliateUrl.trim(),
      research: rec.research,
      recommendation: rec.recommendation,
    });
  }

  async function handleGenerateRecommended(
    facts: ProductFacts,
    hop: string,
    research: MarketResearchReport,
    recommendation: StrategyRecommendation,
  ) {
    setError(null);
    setStep({ kind: "loading", facts });
    const result = await generateRecommendedLpAction({
      facts,
      affiliateUrl: hop,
      research,
      recommendation,
    });
    if (!result.ok) {
      setError(result.error);
      setStep({ kind: "recommendation", facts, affiliateUrl: hop, research, recommendation });
      return;
    }
    setStep({
      kind: "recommended-lp",
      facts,
      affiliateUrl: hop,
      research: result.research,
      recommendation: result.recommendation,
      variant: result.variant,
      previewUrl: result.previewUrl,
      previewPath: result.previewPath,
      usedFallback: result.usedFallback,
      blocked: result.blocked,
    });
  }

  async function handleViewAlternatives(facts: ProductFacts, hop: string, research: MarketResearchReport) {
    setError(null);
    setStep({ kind: "loading", facts });
    const result = await generateVariantsAction({
      productName: facts.productName,
      sourceUrl: facts.sourceUrl || undefined,
      facts,
      affiliateUrl: hop,
      marketResearch: research,
    });
    if (!result.ok) {
      setError(result.error);
      setStep({ kind: "facts", facts });
      return;
    }
    setStep({
      kind: "picking",
      variants: result.variants,
      facts,
      affiliateUrl: hop,
      expanded: null,
    });
  }

  function handlePick(variant: LintedVariant, facts: ProductFacts, hop: string) {
    setStep({ kind: "template", variant, facts, affiliateUrl: hop });
  }

  function handleTemplate(variant: LintedVariant, facts: ProductFacts, hop: string, template: PageTemplateId) {
    const page = composePresellPage({ variant, facts, template });
    setStep({ kind: "compose", variant, facts, affiliateUrl: hop, page, viewport: "desktop" });
  }

  function handleComposeContinue(step: Extract<Step, { kind: "compose" }>) {
    const body = reconstructPageBody(step.page);
    setStep({
      kind: "editing",
      facts: step.facts,
      chosen: {
        name: step.facts.productName,
        slug: slugify(step.facts.productName),
        headline: step.page.hero.headline,
        body,
        ctaLabel: step.page.ctaLabel,
        affiliateUrl: step.affiliateUrl,
        headScript: null,
        adHeadline: null,
        pageTemplate: step.page.template,
        pageComposition: serializePresellPage(step.page),
        productImageSrc: step.page.hero.image.src || null,
        productImageProvenance: step.page.hero.image.provenance,
        subheadline: step.page.hero.subheadline,
        sourceFactsJson: JSON.stringify(step.facts),
      },
    });
  }

  if (step.kind === "input") {
    return (
      <div className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}
        <p className="text-sm text-zinc-400">
          Import factual product information first when possible. The AI must
          use those facts — it must not invent missing ingredients, prices, or
          guarantees.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-300">Product name</span>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
            placeholder="Joint Support Pro"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          />
        </label>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
          <span className="mb-1 block text-sm font-medium text-zinc-300">Product / source URL</span>
          <p className="mb-3 text-xs text-zinc-500">
            Checks robots.txt first and does not bypass blocks. Missing fields
            stay NOT_FOUND — nothing is fabricated.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              disabled={importing}
              placeholder="https://example.com/product-page"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="shrink-0 rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            >
              {importing ? importStatus || "Checking primary source..." : "Import facts"}
            </button>
            {importing ? (
              <button
                type="button"
                onClick={() => void handleCancelImport()}
                className="shrink-0 rounded-md border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {importStatus ? <p className="mt-3 text-sm text-amber-200">{importStatus}</p> : null}
          {importedFacts?.webDiscovery ? <div className="mt-3"><WebDiscoveryPanel facts={importedFacts} /></div> : null}
          {timedOut && importedFacts && (importedFacts.webDiscovery?.acceptedCount || 0) > 0 ? (
            <div className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/20 p-3 text-sm text-emerald-100">
              <p>Verified facts already recovered. Missing fields stay NOT_FOUND.</p>
              {importedFacts.description ? <p className="mt-1 text-xs text-emerald-200/80">{importedFacts.description}</p> : null}
              {importedFacts.ingredientsOrComponents.length > 0 ? (
                <p className="mt-1 text-xs text-emerald-200/80">
                  Ingredients: {importedFacts.ingredientsOrComponents.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {timedOut && importedFacts ? (
            <button
              type="button"
              onClick={() => void handleImport()}
              className="mt-3 rounded-md border border-amber-600 px-3 py-2 text-sm text-amber-100"
            >
              Retry source discovery
            </button>
          ) : null}
          {importError ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-red-400">{importError}</p>
              <p className="text-xs text-zinc-500">
                Manual ProductFacts is a last resort after the primary URL and product-name web discovery both fail.
                Do not generate from invented details.
              </p>
            </div>
          ) : null}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-300">Affiliate URL</span>
          <input
            type="url"
            value={affiliateUrl}
            onChange={(e) => setAffiliateUrl(e.target.value)}
            required
            placeholder="https://example.com/your-hop"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          {importedFacts ? (
            <button
              type="button"
              onClick={() => goToFacts(false)}
              className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950"
            >
              Review facts
            </button>
          ) : null}
          {allowManualLastResort ? (
            <button
              type="button"
              onClick={() => goToFacts(true)}
              className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200"
            >
              Continue with manual facts (last resort)
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (step.kind === "facts" || step.kind === "loading") {
    const loading = step.kind === "loading";
    const facts = step.facts;
    return (
      <FactsForm
        facts={facts}
        loading={loading}
        error={error}
        onCancel={() => setStep({ kind: "input" })}
        onGenerate={(next) => handleGenerate(next)}
      />
    );
  }

  if (step.kind === "recommendation") {
    return (
      <div className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}
        <MarketRecommendationPanel
          recommendation={step.recommendation}
          research={step.research}
          generating={false}
          onGenerate={() =>
            void handleGenerateRecommended(step.facts, step.affiliateUrl, step.research, step.recommendation)
          }
          onAlternatives={() => void handleViewAlternatives(step.facts, step.affiliateUrl, step.research)}
          onRefresh={() => void handleGenerate(step.facts)}
        />
        {step.showResearch ? <MarketResearchPanel research={step.research} /> : null}
        <button
          type="button"
          onClick={() => setStep({ ...step, showResearch: !step.showResearch })}
          className="text-sm text-zinc-400 hover:underline"
        >
          {step.showResearch ? "Hide market research" : "View market research"}
        </button>
        <button
          type="button"
          onClick={() => setStep({ kind: "facts", facts: step.facts })}
          className="block text-sm text-zinc-400 hover:underline"
        >
          ← Back to facts
        </button>
      </div>
    );
  }

  if (step.kind === "recommended-lp") {
    return (
      <div className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}
        <div className="rounded-md border border-emerald-800 bg-emerald-950/20 p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Recommended LP generated</p>
          <p className="mt-2 text-lg font-semibold text-zinc-50">Strategy: {step.variant.approach}</p>
          {step.usedFallback ? (
            <p className="mt-2 text-sm text-amber-200">
              The first recommended strategy was BLOCKED by grounding/policy. Another strategy was generated without changing ProductFacts.
            </p>
          ) : null}
          {step.blocked ? (
            <p className="mt-2 text-sm text-red-300">
              CONTENT_GATE is BLOCKED. Do not publish. AI recommendation does not bypass grounding, policy, asset, visual, or performance QA.
            </p>
          ) : null}
          <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Local preview</p>
          <p className="font-mono text-sm text-zinc-100">{step.previewUrl}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={step.previewPath}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950"
            >
              OPEN LP
            </a>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(step.previewUrl)}
              className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200"
            >
              COPY URL
            </button>
            {!step.blocked ? (
              <button
                type="button"
                onClick={() => handlePick(step.variant, step.facts, step.affiliateUrl)}
                className="rounded-md border border-emerald-700 px-4 py-2 text-sm text-emerald-100"
              >
                Continue to layout / draft
              </button>
            ) : null}
          </div>
        </div>
        <MarketResearchPanel research={step.research} />
        <button
          type="button"
          onClick={() =>
            setStep({
              kind: "recommendation",
              facts: step.facts,
              affiliateUrl: step.affiliateUrl,
              research: step.research,
              recommendation: step.recommendation,
            })
          }
          className="text-sm text-zinc-400 hover:underline"
        >
          ← Back to recommendation
        </button>
      </div>
    );
  }

  if (step.kind === "picking") {
    return (
      <div className="space-y-6">
        <p className="text-sm text-zinc-400">
        Human override. REVIEW / EDUCATIONAL / BUYER_GUIDE remain available for
        experiments. The recommended approach is still not a conversion winner.
        BLOCKED variants can be inspected, but Phase 2.5 will still refuse to publish.
        </p>
        <SourceTrace facts={step.facts} />
        <div className="grid gap-4 md:grid-cols-3">
          {step.variants.map((variant, index) => (
            <div key={variant.approach} className="flex flex-col rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">{variant.approach}</p>
              <h3 className="mt-1 font-semibold text-zinc-50">{variant.headline}</h3>
              <p className={`mt-2 text-xs font-medium uppercase ${GATE_CLASS[variant.finalGate]}`}>
                Final: {variant.finalGate.replaceAll("_", " ")}
              </p>
              <p className={`mt-1 text-xs font-medium uppercase ${GATE_CLASS[variant.lint.gate]}`}>
                Policy: {variant.lint.gate.replaceAll("_", " ")}
              </p>
              <p
                className={`mt-1 text-xs font-medium uppercase ${
                  variant.grounding.status === "GROUNDED"
                    ? GATE_CLASS.READY
                    : variant.grounding.status === "UNGROUNDED"
                      ? GATE_CLASS.BLOCKED
                      : GATE_CLASS.REVIEW_REQUIRED
                }`}
              >
                Grounding: {variant.grounding.status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                ~{variant.wordCount} words · {variant.lint.warningCount} warning(s) ·{" "}
                {variant.lint.blockingCount} blocking
              </p>
              <p className="mt-2 text-xs text-zinc-400">{variant.preview}</p>
              {variant.grounding.unsupportedClaims.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-amber-300">Unsupported factual additions</p>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-500">
                    {variant.grounding.unsupportedClaims.slice(0, 4).map((claim) => (
                      <li key={claim.claim}>
                        “{claim.claim}”
                        <span className="block text-zinc-600">Reason: {claim.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {variant.lint.majorFindings.filter(
                (finding) =>
                  finding.category === "HEALTH_AND_SENSITIVE_CLAIMS" ||
                  finding.ruleId.startsWith("health.") ||
                  finding.ruleId.startsWith("unv."),
              ).length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-amber-300">Health claim warnings</p>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-500">
                    {variant.lint.majorFindings
                      .filter(
                        (finding) =>
                          finding.category === "HEALTH_AND_SENSITIVE_CLAIMS" ||
                          finding.ruleId.startsWith("health.") ||
                          finding.ruleId.startsWith("unv."),
                      )
                      .slice(0, 4)
                      .map((finding) => (
                        <li key={finding.ruleId}>
                          {finding.evidence ? `“${finding.evidence}”` : finding.message}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              {variant.lint.majorFindings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  {variant.lint.majorFindings.slice(0, 3).map((finding) => (
                    <li key={finding.ruleId}>
                      {finding.status.toUpperCase()} {finding.ruleId}
                      {finding.evidence ? `: “${finding.evidence}”` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {step.expanded === index ? (
                <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-300">
                  {variant.body}
                </pre>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setStep({ ...step, expanded: step.expanded === index ? null : index })
                  }
                  className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {step.expanded === index ? "Hide preview" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => handlePick(variant, step.facts, step.affiliateUrl)}
                  className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
                >
                  Select this variant
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setStep({ kind: "facts", facts: step.facts })} className="text-sm text-zinc-400 hover:underline">
          ← Back to facts
        </button>
      </div>
    );
  }

  if (step.kind === "template") {
    return (
      <div className="space-y-6">
        <p className="text-sm text-zinc-400">
          Content strategy and visual template are separate. Pick a layout for this variant.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {PAGE_TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleTemplate(step.variant, step.facts, step.affiliateUrl, id)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left hover:border-emerald-500"
            >
              <p className="text-xs uppercase tracking-wide text-emerald-400">{TEMPLATE_META[id].badge}</p>
              <h3 className="mt-2 font-semibold text-zinc-50">{TEMPLATE_META[id].label}</h3>
              <p className="mt-2 text-sm text-zinc-400">{TEMPLATE_META[id].blurb}</p>
              <div className="mt-4 h-16 rounded-md bg-gradient-to-br from-zinc-800 to-zinc-950" aria-hidden="true" />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setStep({ kind: "facts", facts: step.facts })} className="text-sm text-zinc-400 hover:underline">
          ← Back
        </button>
      </div>
    );
  }

  if (step.kind === "compose") {
    const validation = validateComposedPage(
      step.page,
      step.facts,
      step.affiliateUrl,
      authorizedCopyFromVariant(step.variant, step.facts.productName),
    );
    const previewCampaign: Campaign = {
      id: 0,
      name: step.facts.productName,
      slug: "compose-preview",
      headline: step.page.hero.headline,
      body: reconstructPageBody(step.page),
      ctaLabel: step.page.ctaLabel,
      affiliateUrl: step.affiliateUrl,
      headScript: null,
      adHeadline: null,
      publicationStatus: "draft",
      publishedAt: null,
      createdAt: "",
      updatedAt: "",
      pageTemplate: step.page.template,
      pageComposition: serializePresellPage(step.page),
      productImageSrc: step.page.hero.image.src || null,
      productImageProvenance: step.page.hero.image.provenance,
      subheadline: step.page.hero.subheadline,
      sourceFactsJson: JSON.stringify(step.facts),
    };
    return (
      <div className="space-y-6">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
          <p>
            Template: <span className="font-medium text-zinc-50">{step.page.template}</span>
          </p>
          <p className="mt-1">Headline: {step.page.hero.headline}</p>
          <p className={`mt-2 text-xs font-medium uppercase ${GATE_CLASS[validation.finalGate]}`}>
            Final gate: {validation.finalGate.replaceAll("_", " ")}
          </p>
          {validation.finalGate !== "READY" ? (
            <p className="mt-2 text-xs text-amber-200">
              DIAGNOSTIC PREVIEW — not approved. BLOCKED/REVIEW_REQUIRED composition can be inspected and saved as a
              draft, but it cannot become a public /p/ page.
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            Policy {validation.policy} · Grounding {validation.grounding.status}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Included</p>
          <p className="text-sm">{includedComponentLabels(step.page).join(" · ")}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Omitted</p>
          <ul className="text-sm text-zinc-400">
            {step.page.omitted.map((item) => (
              <li key={item.component}>
                {item.component} — {item.reason}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep({ ...step, viewport: "desktop" })}
            className={`rounded-md px-3 py-1.5 text-sm ${step.viewport === "desktop" ? "bg-emerald-500 text-zinc-950" : "border border-zinc-600"}`}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setStep({ ...step, viewport: "mobile" })}
            className={`rounded-md px-3 py-1.5 text-sm ${step.viewport === "mobile" ? "bg-emerald-500 text-zinc-950" : "border border-zinc-600"}`}
          >
            Mobile
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <div style={{ width: step.viewport === "mobile" ? 390 : "100%" }} className="mx-auto">
            <CampaignTemplate campaign={previewCampaign} disableAffiliateNavigation />
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleComposeContinue(step)}
          className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950"
        >
          Continue to draft form
        </button>
        <button
          type="button"
          onClick={() =>
            setStep({ kind: "template", variant: step.variant, facts: step.facts, affiliateUrl: step.affiliateUrl })
          }
          className="ml-3 text-sm text-zinc-400 hover:underline"
        >
          ← Change template
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Creating stores a DRAFT only. Preview → Policy Check → human Publish.
        Generation never publishes automatically.
      </p>
      <SourceTrace facts={step.facts} />
      <CampaignForm action={createCampaignAction} campaign={step.chosen} submitLabel="Criar campanha" />
    </div>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
      {children}
    </p>
  );
}

function SourceTrace({ facts }: { facts: ProductFacts }) {
  return (
    <div className="space-y-3">
      <WebDiscoveryPanel facts={facts} />
      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
      <p>
        <span className="font-medium text-zinc-300">{facts.origin}</span>
        {facts.sourceUrl ? ` · ${facts.sourceUrl}` : " · no source URL"}
      </p>
      {facts.importWarnings.length > 0 ? (
        <ul className="mt-1 list-inside list-disc">
          {facts.importWarnings.slice(0, 6).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-zinc-600">Admin-only trace. Not shown on the public presell.</p>
    </div>
    </div>
  );
}

function FactsForm({
  facts,
  loading,
  error,
  onCancel,
  onGenerate,
}: {
  facts: ProductFacts;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onGenerate: (facts: ProductFacts) => void;
}) {
  const [productName, setProductName] = useState(facts.productName);
  const [description, setDescription] = useState(facts.description ?? "");
  const [featuresText, setFeaturesText] = useState(listAsTextarea(facts.features));
  const [ingredientsText, setIngredientsText] = useState(listAsTextarea(facts.ingredientsOrComponents));
  const [usageText, setUsageText] = useState(listAsTextarea(facts.usageInformation));
  const [cautionsText, setCautionsText] = useState(listAsTextarea(facts.cautions));
  const [pricing, setPricing] = useState(facts.pricingInformation ?? "");
  const [guarantee, setGuarantee] = useState(facts.guaranteeInformation ?? "");
  const [manufacturer, setManufacturer] = useState(facts.manufacturer ?? "");
  const [reviewedInsufficient, setReviewedInsufficient] = useState(false);

  const originLabel = facts.origin === "IMPORTED" ? "IMPORTED" : "MANUAL";
  const draft = applyManualFacts(facts, {
    productName,
    sourceUrl: facts.sourceUrl,
    description,
    featuresText,
    ingredientsText,
    usageText,
    cautionsText,
    pricingInformation: pricing,
    guaranteeInformation: guarantee,
    manufacturer,
  });
  const quality = assessImportQuality(draft);
  const qualityClass =
    quality === "SUFFICIENT" ? "text-emerald-400" : quality === "PARTIAL" ? "text-amber-400" : "text-red-400";

  function submit() {
    if (!draft.productName.trim()) return;
    onGenerate(draft);
  }

  return (
    <div className="space-y-5">
      {error ? <Alert>{error}</Alert> : null}
      <WebDiscoveryPanel facts={facts} />
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Product facts</p>
        <p className="mt-1 text-sm text-zinc-400">
          {originLabel} facts. Empty fields stay NOT_FOUND. Do not invent them
          for the AI.
        </p>
        <p className={`mt-2 text-sm font-medium uppercase tracking-wide ${qualityClass}`}>
          Import quality: {quality}
        </p>
      </div>
      {facts.sourceUrl ? (
        <p className="font-mono text-xs text-zinc-500">Source: {facts.sourceUrl}</p>
      ) : (
        <p className="text-xs uppercase tracking-wide text-amber-300">MANUAL PRODUCT FACTS</p>
      )}
      {facts.importWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium">Import warnings</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {facts.importWarnings.map((warning) => (
              <li key={warning}>⚠ {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {quality === "INSUFFICIENT" ? (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">
          <p>
            Imported information is insufficient for grounded AI generation.
            Review or add manual facts.
          </p>
          <label className="mt-2 flex items-start gap-2 text-xs text-red-100/90">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={reviewedInsufficient}
              onChange={(e) => setReviewedInsufficient(e.target.checked)}
              disabled={loading}
            />
            I reviewed these facts and want to generate anyway.
          </label>
        </div>
      ) : null}

      <FactField
        label="Product"
        confidence={draft.confidence.productName}
        snippets={snippetsForField(facts, "productName")}
      >
        <input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          disabled={loading}
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Description"
        confidence={draft.confidence.description}
        snippets={snippetsForField(facts, "description")}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Features (one per line)"
        confidence={draft.confidence.features}
        snippets={snippetsForField(facts, "features")}
      >
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          disabled={loading}
          rows={5}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Ingredients / components"
        confidence={draft.confidence.ingredientsOrComponents}
        snippets={snippetsForField(facts, "ingredientsOrComponents")}
      >
        <textarea
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          disabled={loading}
          rows={4}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Usage / how it works"
        confidence={draft.confidence.usageInformation}
        snippets={snippetsForField(facts, "usageInformation")}
      >
        <textarea
          value={usageText}
          onChange={(e) => setUsageText(e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Warnings"
        confidence={draft.confidence.cautions}
        snippets={snippetsForField(facts, "cautions")}
      >
        <textarea
          value={cautionsText}
          onChange={(e) => setCautionsText(e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Pricing"
        confidence={draft.confidence.pricingInformation}
        snippets={snippetsForField(facts, "pricingInformation")}
      >
        <input
          value={pricing}
          onChange={(e) => setPricing(e.target.value)}
          disabled={loading}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Guarantee"
        confidence={draft.confidence.guaranteeInformation}
        snippets={snippetsForField(facts, "guaranteeInformation")}
      >
        <input
          value={guarantee}
          onChange={(e) => setGuarantee(e.target.value)}
          disabled={loading}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>
      <FactField
        label="Manufacturer"
        confidence={draft.confidence.manufacturer}
        snippets={snippetsForField(facts, "manufacturer")}
      >
        <input
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          disabled={loading}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 disabled:opacity-60"
        />
      </FactField>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={loading || (quality === "INSUFFICIENT" && !reviewedInsufficient)}
          className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
        >
          {loading ? "Researching current market…" : "Research market & recommend"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FactField({
  label,
  confidence,
  snippets,
  children,
}: {
  label: string;
  confidence: FactConfidence;
  snippets: Array<{ text: string }>;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-zinc-300">
        {label}
        <span className="text-xs font-normal uppercase tracking-wide text-zinc-500">
          {provenanceLabel(confidence)}
        </span>
      </span>
      {children}
      {snippets.length > 0 ? (
        <details className="mt-1 text-xs text-zinc-500">
          <summary className="cursor-pointer text-zinc-600 hover:text-zinc-400">Source snippet</summary>
          <p className="mt-1 whitespace-pre-wrap text-zinc-500">{snippets[0].text}</p>
        </details>
      ) : null}
    </label>
  );
}
