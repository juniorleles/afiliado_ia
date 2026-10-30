export const EXECUTION_54BA_CHECKPOINT_ID = "54ba-best-known-baseline";
export const EXECUTION_54BA_GENERATION_ID = "lp-mvs7mja3-0d690e7c";
export const EXECUTION_54BA_EXTRA_CHECKPOINT_FILES = ["src/components/product-showcase/v4/page.tsx"] as const;

export const EXECUTION_54BA_BASELINE = {
  desktop: 72,
  mobile: 68,
  editorial: 73,
  generationId: EXECUTION_54BA_GENERATION_ID,
  rubric: "PREMIUM_VISUAL_EVALUATION_V2",
} as const;

export type PremiumRedesignPlanItem = {
  component: string;
  observedProblem: string;
  screenshotEvidence: string;
  referenceGap: string;
  architecturalChange: string;
  files: string[];
  mobileImpact: string;
  editorialImpact: string;
  multiproductCompatible: true;
  rollbackStrategy: string;
};

export const EXECUTION_54BA_PLAN: PremiumRedesignPlanItem[] = [
  {
    component: "hero",
    observedProblem: "Desktop first fold is a two-column layout with unused cream space and the next section leaking into the fold.",
    screenshotEvidence: "54AZ desktop-first-fold.png: copy and 2x2 rail sit left; packshot sits in a flat mint square; Directions for Use is visible.",
    referenceGap: "Reference fills the first screen with copy, a dominant staged packshot, and a vertical logistics column beside the product.",
    architecturalChange: "Rebuild the split hero as a three-area composition (copy | packshot | vertical rail) that occupies the first fold.",
    files: ["src/app/premium-design-engine.css", "src/components/product-showcase/v4/page.tsx"],
    mobileImpact: "Below 960px keep packshot first, hide the rail, and use a 2x2 fact tile grid instead of shrinking the desktop rail.",
    editorialImpact: "No new claims. Rail still restates approved dispatch, delivery, returns, and payment facts.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore checkpoint 54ba-best-known-baseline, including page.tsx.",
  },
  {
    component: "packshot",
    observedProblem: "Approved packshot sits in a padded mint square without depth, halo, or ground shadow.",
    screenshotEvidence: "54AZ desktop-first-fold.png: the bottle group is inset in a flat rounded rectangle.",
    referenceGap: "Reference stages the same kind of packshot against a lit scene with ground shadow and surrounding depth.",
    architecturalChange: "Keep asset-cbc045ab only. Add CSS layers (glow, vignette, drop shadow, inner ring) and scale the image inside the stage.",
    files: ["src/app/premium-design-engine.css"],
    mobileImpact: "Larger packshot, centered, no crop, object-fit contain.",
    editorialImpact: "None. No new packaging, seals, or competitor images.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore checkpoint CSS.",
  },
  {
    component: "cta",
    observedProblem: "Hero CTA is a modest pill and does not occupy the copy column like the reference action.",
    screenshotEvidence: "54AZ desktop-first-fold.png: short orange button under the intro.",
    referenceGap: "Reference uses a full-width high-contrast orange action with an arrow.",
    architecturalChange: "Full-width disabled preview button, larger type, glow, and a decorative arrow span. Still preview-disabled.",
    files: ["src/components/design-system/premium-blocks.tsx", "src/app/premium-design-engine.css"],
    mobileImpact: "Full-width CTA under the product name.",
    editorialImpact: "Label stays View Product Details. Caption stays preview-only.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore checkpoint blocks and CSS.",
  },
  {
    component: "ingredients",
    observedProblem: "Specifications with two or more labeled facts render as a generic table instead of premium cards.",
    screenshotEvidence: "54AZ desktop fold already shows the next band; ingredients later use a spec table rather than a card system.",
    referenceGap: "Reference uses a consistent ingredient row with typographic identity, not a data table.",
    architecturalChange: "Always render approved ingredient facts through IngredientCardGrid with a typographic monogram. Omit the grid when there are no facts.",
    files: ["src/components/product-showcase/v4/page.tsx", "src/components/design-system/premium-blocks.tsx", "src/app/premium-design-engine.css"],
    mobileImpact: "Single-column cards, no invented photographs.",
    editorialImpact: "Same approved names and details. No therapeutic properties.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore page.tsx and blocks from checkpoint.",
  },
  {
    component: "fulfillment-cards",
    observedProblem: "Guarantee, shipping, payment, and returns use the same generic bordered card.",
    screenshotEvidence: "54AZ hero rail is a 2x2 of simple outlined tiles; later cards share the same skin.",
    referenceGap: "Reference uses a checklist for returns/shipping and a circular guarantee badge, not identical cards.",
    architecturalChange: "Fulfillment becomes a premium checklist. Guarantee keeps the circular day badge. FAQ gets a chevron accordion.",
    files: ["src/components/design-system/premium-blocks.tsx", "src/app/premium-design-engine.css", "src/lib/presell-quality/premium-slots.ts"],
    mobileImpact: "Checklist stacks; guarantee stacks; FAQ remains one column.",
    editorialImpact: "Bodies stay first-sentences of approved text. No free shipping.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore checkpoint files.",
  },
  {
    component: "editorial",
    observedProblem: "Trust heading stays Cautions while the section is shipping, returns, and payment. Guarantee statements repeat the same window.",
    screenshotEvidence: "54AZ desktop-first-fold.png already shows Directions for Use; later trust copy is operational, not cautions.",
    referenceGap: "Reference uses scannable operational headings without inventing medical claims.",
    architecturalChange: "Title the trust band from the cards actually rendered. Deduplicate overlapping guarantee statements. Do not add facts.",
    files: ["src/lib/presell-quality/premium-slots.ts", "src/components/product-showcase/v4/page.tsx"],
    mobileImpact: "Clearer headings on small screens.",
    editorialImpact: "Scanability and accurate section names only.",
    multiproductCompatible: true,
    rollbackStrategy: "Restore premium-slots.ts and page.tsx.",
  },
];

export type EditorialRecoveryChange = {
  location: string;
  previousText: string;
  newText: string;
  approvedFact: string;
  reason: string;
  safetyCheck: string;
};

export const EXECUTION_54BA_EDITORIAL_DIFF: EditorialRecoveryChange[] = [
  {
    location: "trust.sectionTitle",
    previousText: "Cautions",
    newText: "Shipping, returns, and payment",
    approvedFact: "Trust items already grouped as DISPATCH, DELIVERY, RETURNS, and PAYMENT cards from the Product Contract.",
    reason: "The rendered section is operational, so Cautions mislabels the content.",
    safetyCheck: "Title changes only when fulfillment cards exist. Leftover caution lines keep a Cautions subheading. No new promise.",
  },
  {
    location: "fulfillment.DELIVERY.title",
    previousText: "Delivery window",
    newText: "Estimated delivery",
    approvedFact: "Seller-stated 5 to 10 days delivery window already on the card body.",
    reason: "A shorter label matches the fact without implying a guaranteed arrival.",
    safetyCheck: "Body still includes the seller window and does not say free shipping.",
  },
  {
    location: "guarantee.statements",
    previousText: "Repeated seller-stated refund window copied from section body and operational returns.",
    newText: "Unique statements only; shorter lines contained in a longer approved statement are dropped.",
    approvedFact: "Seller-stated refund window and empty-bottle conditions already in the Product Contract.",
    reason: "Remove repetition that stalls editorial quality without dropping conditions.",
    safetyCheck: "Does not omit unique conditions. Seller-stated attribution remains.",
  },
  {
    location: "specifications.presentation",
    previousText: "Labeled ingredients rendered as a specification table.",
    newText: "Labeled ingredients rendered as named cards with a typographic monogram.",
    approvedFact: "Ingredient names and details already in the specifications section.",
    reason: "Scanability and a reusable card system. No invented photographs or properties.",
    safetyCheck: "Cards are omitted when there are no ingredient facts.",
  },
];

export const EXECUTION_54BA_COMPONENT_MANIFEST = {
  hero: "three-area copy | pack | rail",
  packshot: "css-depth asset-cbc045ab only",
  cta: "full-width preview-disabled",
  ingredients: "typographic cards",
  fulfillment: "checklist rows",
  guarantee: "circular day badge",
  faq: "chevron accordion",
  extraCheckpointFiles: EXECUTION_54BA_EXTRA_CHECKPOINT_FILES,
} as const;
