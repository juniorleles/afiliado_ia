export const QUALITY_CALIBRATION_FIXTURES = [
  {
    id: "fixture-visual-poor",
    kind: "VISUALLY_POOR",
    expectedStatus: "QUALITY_REJECTED",
    notes: "Empty hero, weak hierarchy, no packshot.",
  },
  {
    id: "fixture-editorial-thin",
    kind: "EDITORIALLY_INSUFFICIENT",
    expectedStatus: "QUALITY_BLOCKED",
    notes: "Approved ingredients only; no description or usage.",
  },
  {
    id: "fixture-mobile-broken",
    kind: "MOBILE_BROKEN",
    expectedStatus: "QUALITY_REJECTED",
    notes: "Desktop acceptable, 390px overflow or unreadable type.",
  },
  {
    id: "fixture-unfit-image",
    kind: "UNFIT_IMAGE",
    expectedStatus: "QUALITY_BLOCKED",
    notes: "Promotional banner used as packshot.",
  },
  {
    id: "fixture-misleading-cta",
    kind: "MISLEADING_CTA",
    expectedStatus: "QUALITY_BLOCKED",
    notes: "A commercial hop is shown without authorization.",
  },
  {
    id: "fixture-grounded-strong",
    kind: "GROUNDED_STRONG",
    expectedStatus: "QUALITY_PASSED",
    notes: "Grounded copy, approved packshot, readable mobile. Only a real multimodal evaluator may assign QUALITY_PASSED.",
  },
] as const;
