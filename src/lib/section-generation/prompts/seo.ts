export const seoPrompt = {
  id: "seo",
  objective: "Write the title, meta description, slug, Open Graph, keywords, and canonical from existing fields.",
  rule: "The title is the product name. Keywords are only the measured terms. Leave the canonical empty when no public URL was supplied. Do not invent search volume.",
} as const;
