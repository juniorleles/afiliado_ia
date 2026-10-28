export type DesignRecoveryChange = {
  priority: "HIGH" | "MEDIUM" | "LOW";
  section: string;
  problem: string;
  component: string;
  proposedChange: string;
  expectedImpact: "HIGH" | "MEDIUM" | "LOW";
  contentChangeRequired: false;
  rollbackAvailable: true;
};

export const EXECUTION_54AZ_BASELINE = {
  desktop: 70,
  mobile: 65,
  editorial: 73,
  generationId: "lp-mvs7mja3-0d690e7c",
  rubric: "PREMIUM_VISUAL_EVALUATION_V2",
} as const;

export const EXECUTION_54AZ_PLAN: DesignRecoveryChange[] = [
  {
    priority: "HIGH",
    section: "hero",
    problem: "Packshot is visually secondary and the copy column leaves unused space.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Make the packshot column dominant and place the logistics rail under the copy so the first fold is product, fact, and CTA.",
    expectedImpact: "HIGH",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "HIGH",
    section: "packshot",
    problem: "Approved packshot sits in a padded frame and does not occupy the first fold.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Reduce stage padding, keep object-fit contain, and scale the approved asset without distortion.",
    expectedImpact: "HIGH",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "HIGH",
    section: "mobile",
    problem: "Mobile packing and alignment scored 65 and sit below the official finish.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Keep packshot first, tighten vertical rhythm, full-width CTA, and chips instead of a hidden rail below 960px.",
    expectedImpact: "HIGH",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "HIGH",
    section: "cta",
    problem: "CTA is visible but quieter than the premium reference.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Increase size, weight, and shadow of the existing forest CTA without enabling a commercial hop.",
    expectedImpact: "HIGH",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "MEDIUM",
    section: "cards",
    problem: "Cards look unfinished relative to the reference.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Tighten borders, icon treatment, and spacing on reusable ingredient, fulfillment, usage, and FAQ cards.",
    expectedImpact: "MEDIUM",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "MEDIUM",
    section: "contrast",
    problem: "Some supporting text is quieter than the headline.",
    component: "src/app/premium-design-engine.css",
    proposedChange: "Set hero supporting copy to ink and keep captions on the muted token.",
    expectedImpact: "MEDIUM",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
  {
    priority: "MEDIUM",
    section: "editorial",
    problem: "Returns and payment cards restate long FAQ answers.",
    component: "src/lib/presell-quality/premium-slots.ts",
    proposedChange: "Keep one seller-stated sentence on payment and returns cards. Do not invent facts.",
    expectedImpact: "MEDIUM",
    contentChangeRequired: false,
    rollbackAvailable: true,
  },
];
