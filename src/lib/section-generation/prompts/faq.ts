export const faqPrompt = {
  id: "faq",
  objective: "Answer only a measured question that a product fact supports.",
  rule: "Keep the measured question. Leave the answer empty when no product fact supports it. Do not invent a question or an answer.",
} as const;
