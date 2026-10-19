export const schemaPrompt = {
  id: "schema",
  objective: "Build JSON-LD from the product name and measured questions.",
  rule: "Use WebPage and the questions already measured. Omit answers that are empty. Do not add a price, a rating, or a review.",
} as const;
