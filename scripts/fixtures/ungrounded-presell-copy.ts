/**
 * Sanitized regression excerpts based on real generated supplement-presell
 * failures. Not a product-specific allow/deny list — production logic must
 * treat these as generic unsupported additions.
 */

export const UNSOURCED_SAFETY =
  "Probiotic supplements are generally considered safe for healthy individuals.";

export const UNSOURCED_DRUG_INTERACTION =
  "Probiotics can potentially interact with certain medications or health conditions.";

export const UNSOURCED_QUANTITY_RANGE =
  "Oral probiotic quantities typically range from millions to billions of CFU.";

export const UNSOURCED_TIMELINE =
  "One to two months may be needed before someone can evaluate whether the product is a fit.";

export const UNSOURCED_RESEARCH =
  "Research suggests many dental problems begin when the mouth's microbial balance shifts.";

export const UNSOURCED_TRIVIA =
  "Teeth can remain intact for thousands of years because enamel is so durable.";

export const UNSOURCED_MECHANISM =
  "These probiotic strains are intended to colonize the mouth and support oral tissue health.";

export const GROUNDED_JACKET_PARAGRAPH = `This winter jacket is a mid-weight insulated layer for daily cold weather.
The listing describes a water-resistant shell for commuting.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell

## FAQ

- Is it a medical device? No.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days.
`;

export const SANITIZED_REVIEW_EXCERPT = `This chewable tablet is described as an oral probiotic.

## What Is This Product?

A supplement sold through a third-party merchant.

## FAQ

- ${UNSOURCED_SAFETY}
- ${UNSOURCED_DRUG_INTERACTION}

## Final Thoughts

Read the merchant page before you buy.
`;

export const SANITIZED_EDUCATIONAL_EXCERPT = `The human mouth contains hundreds of bacterial species.

${UNSOURCED_TRIVIA}

Lactobacillus species are commonly studied for oral and digestive health.
${UNSOURCED_QUANTITY_RANGE}

## FAQ

- ${UNSOURCED_RESEARCH}

## Final Thoughts

This page restates listing copy; it is not a scientific review.
`;

export const SANITIZED_BUYER_GUIDE_EXCERPT = `Compare the listed ingredients with your own priorities.

${UNSOURCED_TIMELINE}

Avoid antiseptic mouthwash for a short window if you want the tablet to remain in contact with the mouth.

${UNSOURCED_MECHANISM}

## Final Thoughts

Check current pricing on the merchant site. Pricing is not listed here.
`;
