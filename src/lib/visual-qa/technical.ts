import type { LayoutSnapshot, TechnicalAudit, VisualQaFinding } from "@/lib/visual-qa/types";

export function technicalAuditFromSnapshots(snapshots: LayoutSnapshot[]): {
  audit: TechnicalAudit;
  findings: VisualQaFinding[];
} {
  const notes: string[] = [];
  const findings: VisualQaFinding[] = [];
  let headingOrderOk = true;
  let missingAlts = 0;
  let smallTapTargets = 0;
  let faqKeyboard = true;
  let domNodes = 0;

  for (const snapshot of snapshots) {
    const vp = `${snapshot.viewport.width}x${snapshot.viewport.height}`;
    if (!snapshot.h1) {
      headingOrderOk = false;
      findings.push({
        category: "accessibility",
        severity: "WARNING",
        viewport: vp,
        description: "No h1 in the rendered document.",
        evidence: "document.querySelector('h1') is null",
        suggestedPresentationFix: "Keep a single dominant page headline.",
        actionCode: "IMPROVE_TYPE_SCALE",
        source: "technical",
      });
    }
    missingAlts += snapshot.images.filter((img) => !img.alt && !img.placeholder).length;
    smallTapTargets += snapshot.ctas.filter(
      (cta) => cta.visible && cta.position !== "sticky" && (cta.width < 44 || cta.height < 40),
    ).length;
    if (snapshot.faqDetails === 0 && snapshot.h2.some((t) => /faq/i.test(t))) {
      faqKeyboard = false;
    }
    domNodes = Math.max(domNodes, snapshot.paragraphs.count + snapshot.cards.count + snapshot.h2.length);
    if (snapshot.overflowX) notes.push(`overflow-x at ${vp}`);
  }

  if (missingAlts > 0) {
    findings.push({
      category: "accessibility",
      severity: "WARNING",
      viewport: "all",
      description: "One or more images are missing alt text.",
      evidence: `missingAlts=${missingAlts}`,
      suggestedPresentationFix: "Provide descriptive alt on product and editorial images.",
      actionCode: "ADD_VISUAL_ASSET_SLOT",
      source: "technical",
    });
  }

  notes.push("Lighthouse was not invoked; Playwright layout + accessibility heuristics are the technical audit.");
  notes.push("A strong technical audit does not imply PREMIUM_INTERNATIONAL visual readiness.");

  return {
    audit: {
      engine: "playwright-deterministic",
      lighthouseUsed: false,
      headingOrderOk,
      missingAlts,
      smallTapTargets,
      faqKeyboard,
      domNodes,
      notes,
    },
    findings,
  };
}
