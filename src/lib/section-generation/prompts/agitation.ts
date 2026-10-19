export const agitationPrompt = {
  id: "agitation",
  objective: "Explain a consequence only when the measured text already states one.",
  rule: "Do not create artificial fear. Do not add medical claims. If the source only names discomfort, repeat that discomfort and leave the consequence empty.",
} as const;
