export const benefitsPrompt = {
  id: "benefits",
  objective: "Turn a listed characteristic into a benefit line without adding a new claim.",
  rule: "Each line keeps the source wording and records Product Facts or Market Intelligence. Do not invent benefits.",
} as const;
