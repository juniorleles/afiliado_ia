export const testimonialsPrompt = {
  id: "testimonials",
  objective: "Repeat extracted testimonials only.",
  rule: "Do not invent a quote, a name, or a result. If none were extracted, do not generate the section.",
} as const;
