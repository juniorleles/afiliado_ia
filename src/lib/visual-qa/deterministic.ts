import type { LayoutSnapshot, VisualQaFinding, VisualQaActionCode } from "@/lib/visual-qa/types";

function finding(
  partial: Omit<VisualQaFinding, "source"> & { source?: VisualQaFinding["source"] },
): VisualQaFinding {
  return { source: "deterministic", ...partial };
}

function firstContentHeading(h2: string[]): string | null {
  return h2.find((title) => !/how we review/i.test(title)) ?? null;
}

function templateRubric(template: string): string {
  const key = template.toUpperCase();
  if (key === "BUYER_GUIDE") {
    return "BUYER_GUIDE: product + decision-support presentation (not a generic ecommerce splash).";
  }
  if (key === "EDITORIAL") {
    return "EDITORIAL: publication/wellness editorial feel (not a hard-sell product grid).";
  }
  return "REVIEW: editorial/product evaluation feel (not a generic ecommerce splash).";
}

export function analyzeLayoutSnapshot(snapshot: LayoutSnapshot, template: string): VisualQaFinding[] {
  const vp = `${snapshot.viewport.width}x${snapshot.viewport.height}`;
  const out: VisualQaFinding[] = [
    finding({
      category: "artDirection",
      severity: "INFO",
      viewport: vp,
      description: `Template-aware review: ${templateRubric(template)}`,
      evidence: `template=${template}`,
      suggestedPresentationFix: "Keep template-specific visual language while meeting PREMIUM_INTERNATIONAL.",
      actionCode: "STRENGTHEN_ART_DIRECTION",
    }),
  ];

  if (snapshot.overflowX) {
    out.push(
      finding({
        category: "layout",
        severity: "HIGH",
        viewport: vp,
        description: "Horizontal overflow on the rendered viewport.",
        evidence: `scrollWidth=${snapshot.scrollWidth} clientWidth=${snapshot.clientWidth}`,
        suggestedPresentationFix: "Prevent full-width elements from exceeding the viewport.",
        actionCode: "IMPROVE_MOBILE_COMPOSITION",
      }),
    );
  }

  const placeholder = snapshot.images.filter((img) => img.placeholder);
  if (placeholder.length > 0) {
    out.push(
      finding({
        category: "productPresentation",
        severity: "HIGH",
        viewport: vp,
        description: "Hero/product visual is a placeholder rather than a useful product image.",
        evidence: placeholder.map((img) => img.alt).join("; ") || "placeholder role=img",
        suggestedPresentationFix: "Acquire an official packshot and place it as the hero focal point. Do not generate a fake packshot.",
        actionCode: "ACQUIRE_PRODUCT_IMAGE",
      }),
    );
    out.push(
      finding({
        category: "hero",
        severity: "HIGH",
        viewport: vp,
        description: "Product is not visually prominent; placeholder dominates the product slot.",
        evidence: "Placeholder copy present in the product visual region.",
        suggestedPresentationFix: "Give the product a real focal image and keep the primary CTA adjacent to it.",
        actionCode: "PROMOTE_PRODUCT_VISUAL",
      }),
    );
  }

  if (snapshot.images.length === 0) {
    out.push(
      finding({
        category: "imagery",
        severity: "HIGH",
        viewport: vp,
        description: "No product or editorial imagery in the rendered article.",
        evidence: "article img / role=img count is 0",
        suggestedPresentationFix: "Add a product visual slot in the hero. Do not invent a packshot with AI.",
        actionCode: "ADD_VISUAL_ASSET_SLOT",
      }),
    );
  }

  if (snapshot.cards.count >= 18) {
    out.push(
      finding({
        category: "contentDensity",
        severity: "HIGH",
        viewport: vp,
        description: "Large matrix of similarly styled cards; presentation feels repetitive.",
        evidence: `${snapshot.cards.count} card-like items, ${snapshot.cards.uniqueTexts} unique texts, avgHeight=${Math.round(snapshot.cards.avgHeight)}px`,
        suggestedPresentationFix: "Reduce visible card repetition; group or collapse secondary items.",
        actionCode: "REDUCE_CARD_REPETITION",
      }),
    );
  } else if (snapshot.cards.count >= 12) {
    out.push(
      finding({
        category: "contentDensity",
        severity: "WARNING",
        viewport: vp,
        description: "Many similarly styled cards compete for attention.",
        evidence: `${snapshot.cards.count} card-like items`,
        suggestedPresentationFix: "Vary section composition and collapse secondary cards.",
        actionCode: "REDUCE_CARD_REPETITION",
      }),
    );
  }

  if (snapshot.paragraphs.longCount >= 4 || snapshot.paragraphs.maxChars >= 500) {
    out.push(
      finding({
        category: "contentDensity",
        severity: snapshot.paragraphs.maxChars >= 700 ? "HIGH" : "WARNING",
        viewport: vp,
        description: "High prose density: long text blocks dominate the rendered page.",
        evidence: `longParagraphs=${snapshot.paragraphs.longCount} maxChars=${snapshot.paragraphs.maxChars}`,
        suggestedPresentationFix: "Chunk long regions; move detail into accordion/summary disclosure.",
        actionCode: "REDUCE_VISIBLE_CONTENT_DENSITY",
      }),
    );
  }

  const tall = snapshot.pageHeight > (snapshot.viewport.width >= 1024 ? 9000 : 11000);
  if (tall) {
    out.push(
      finding({
        category: "hierarchy",
        severity: "HIGH",
        viewport: vp,
        description: "Page is extremely tall relative to a scannable consumer presell.",
        evidence: `pageHeight=${snapshot.pageHeight}px at ${vp}`,
        suggestedPresentationFix: "Collapse secondary detail and tighten vertical rhythm.",
        actionCode: "COLLAPSE_SECONDARY_DETAILS",
      }),
    );
  }

  const first = firstContentHeading(snapshot.h2);
  if (first && /overview|consider/i.test(first) && snapshot.h2.some((t) => /ingredient|how to use|feature/i.test(t))) {
    const factIdx = snapshot.h2.findIndex((t) => /ingredient|how to use|feature/i.test(t));
    const overviewIdx = snapshot.h2.findIndex((t) => /overview/i.test(t));
    if (overviewIdx >= 0 && factIdx > overviewIdx) {
      out.push(
        finding({
          category: "hierarchy",
          severity: "WARNING",
          viewport: vp,
          description: "Important product facts appear after dense overview copy.",
          evidence: `h2 order: ${snapshot.h2.join(" → ")}`,
          suggestedPresentationFix: "Visually promote ingredients/usage before long overview prose.",
          actionCode: "CREATE_HERO_FOCAL_POINT",
        }),
      );
    }
  }

  if (snapshot.h2.length >= 5 && snapshot.images.filter((i) => !i.placeholder).length <= 1) {
    out.push(
      finding({
        category: "artDirection",
        severity: "WARNING",
        viewport: vp,
        description: "Many sections share a flat visual treatment with little imagery or background variation.",
        evidence: `${snapshot.h2.length} h2 sections, ${snapshot.images.filter((i) => !i.placeholder).length} non-placeholder images`,
        suggestedPresentationFix: "Alternate section composition and add visual rhythm without changing facts.",
        actionCode: "INCREASE_SECTION_VARIATION",
      }),
    );
  }

  if (snapshot.h1 && snapshot.h1.fontSize < 28) {
    out.push(
      finding({
        category: "hero",
        severity: "WARNING",
        viewport: vp,
        description: "Headline type scale is modest for a premium hero.",
        evidence: `h1 fontSize=${snapshot.h1.fontSize}px`,
        suggestedPresentationFix: "Increase headline dominance while keeping wrap readable.",
        actionCode: "IMPROVE_TYPE_SCALE",
      }),
    );
  }

  const visibleCtas = snapshot.ctas.filter((c) => c.visible && c.position !== "sticky");
  const clustered = visibleCtas.some((a, i) =>
    visibleCtas.some((b, j) => i < j && Math.abs(a.top - b.top) < 180),
  );
  if (clustered) {
    out.push(
      finding({
        category: "cta",
        severity: "WARNING",
        viewport: vp,
        description: "Multiple CTAs are clustered in the same vertical region.",
        evidence: visibleCtas.map((c) => `${c.position}@${Math.round(c.top)}`).join(", "),
        suggestedPresentationFix: "Keep one end CTA; space mid-content CTAs away from the close.",
        actionCode: "IMPROVE_CTA_DISTRIBUTION",
      }),
    );
  }

  if (snapshot.viewport.width <= 430) {
    const sticky = snapshot.ctas.find((c) => c.position === "sticky");
    if (sticky && !sticky.visible) {
      out.push(
        finding({
          category: "mobile",
          severity: "WARNING",
          viewport: vp,
          description: "Sticky mobile CTA is not visible at a small viewport.",
          evidence: `stickyDisplay=${snapshot.stickyDisplay}`,
          suggestedPresentationFix: "Show the sticky CTA only on small screens and keep tap size ≥44px.",
          actionCode: "IMPROVE_MOBILE_COMPOSITION",
        }),
      );
    }
    const small = snapshot.ctas.filter((c) => c.visible && (c.width < 44 || c.height < 40));
    if (small.length) {
      out.push(
        finding({
          category: "accessibility",
          severity: "WARNING",
          viewport: vp,
          description: "CTA tap target is smaller than a comfortable 44px target.",
          evidence: small.map((c) => `${c.position} ${Math.round(c.width)}x${Math.round(c.height)}`).join("; "),
          suggestedPresentationFix: "Enlarge mobile CTA hit area.",
          actionCode: "IMPROVE_MOBILE_COMPOSITION",
        }),
      );
    }
  }

  if (!snapshot.disclosurePresent) {
    out.push(
      finding({
        category: "trust",
        severity: "HIGH",
        viewport: vp,
        description: "Affiliate disclosure is not visible on the rendered page.",
        evidence: "No disclosure text matched.",
        suggestedPresentationFix: "Keep the disclosure readable near the top of the page.",
        actionCode: "STRENGTHEN_ART_DIRECTION",
      }),
    );
  }

  const missingTrust = ["About", "Contact", "Privacy", "Terms", "Affiliate Disclosure"].filter(
    (label) => !snapshot.footerLinks.some((l) => l.toLowerCase().includes(label.toLowerCase().split(" ")[0]!)),
  );
  if (missingTrust.length) {
    out.push(
      finding({
        category: "trust",
        severity: "WARNING",
        viewport: vp,
        description: "One or more public trust links are not visible in the footer.",
        evidence: `missing=${missingTrust.join(", ")}`,
        suggestedPresentationFix: "Keep About, Contact, Privacy, Terms, and Affiliate Disclosure in the footer.",
        actionCode: "STRENGTHEN_ART_DIRECTION",
      }),
    );
  }

  if (snapshot.fakeTrustHits.length) {
    out.push(
      finding({
        category: "trust",
        severity: "HIGH",
        viewport: vp,
        description: "Possible fake trust or urgency pattern in the rendered page.",
        evidence: snapshot.fakeTrustHits.join("; "),
        suggestedPresentationFix: "Remove fake ratings, badges, scarcity, or countdowns.",
        actionCode: "REMOVE_FAKE_TRUST_SIGNAL",
      }),
    );
  }

  if (snapshot.cards.count >= 10 && snapshot.faqDetails === 0 && snapshot.paragraphs.longCount >= 2) {
    out.push(
      finding({
        category: "progressiveDisclosure",
        severity: "WARNING",
        viewport: vp,
        description: "Secondary detail is fully expanded; progressive disclosure is weak.",
        evidence: `cards=${snapshot.cards.count} faqDetails=${snapshot.faqDetails} longParagraphs=${snapshot.paragraphs.longCount} template=${template}`,
        suggestedPresentationFix: "Collapse secondary/detail-heavy copy into accordion or summary+details.",
        actionCode: "IMPROVE_PROGRESSIVE_DISCLOSURE",
      }),
    );
  }

  if (snapshot.viewport.width >= 1200 && snapshot.h1 && snapshot.h1.fontSize >= 28 && snapshot.cards.count < 8 && !placeholder.length) {
    out.push(
      finding({
        category: "desktop",
        severity: "INFO",
        viewport: vp,
        description: "Desktop layout has a readable headline and limited card repetition.",
        evidence: `h1=${snapshot.h1.fontSize}px cards=${snapshot.cards.count}`,
        suggestedPresentationFix: "Maintain hierarchy; still compare against PREMIUM_INTERNATIONAL art direction.",
        actionCode: "STRENGTHEN_ART_DIRECTION",
      }),
    );
  }

  return out;
}

export function uniqueRecommendedFixes(
  findings: VisualQaFinding[],
): Array<{ actionCode: VisualQaActionCode; explanation: string }> {
  const map = new Map<VisualQaActionCode, string>();
  for (const item of findings) {
    if (item.severity === "INFO") continue;
    if (!map.has(item.actionCode)) map.set(item.actionCode, item.suggestedPresentationFix);
  }
  return [...map.entries()].map(([actionCode, explanation]) => ({ actionCode, explanation }));
}
