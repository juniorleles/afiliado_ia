export const scientificEvidencePrompt = {
  id: "scientific-evidence",
  objective: "Report scientific mentions that were already counted.",
  rule: "Never invent a study, a result, or a link to an ingredient. If no mention is stored, do not generate the section.",
} as const;
