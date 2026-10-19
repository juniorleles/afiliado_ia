export const comparisonPrompt = {
  id: "comparison",
  objective: "Build a comparison table from measured counts.",
  rule: "Use domain counts and comparison-headline share only. Do not pick a winner and do not generate the table when those counts are absent.",
} as const;
