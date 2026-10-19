export function approachEnglish(id: string | null): string | null {
  const labels: Record<string, string> = {
    REVIEW: "review",
    EDUCATIONAL: "educational page",
    BUYER_GUIDE: "buying guide",
    COMPARISON: "comparison",
    QUIZ: "question page",
    LONG_FORM: "long page",
    MEDICAL: "cautious page",
    AUTHORITY: "source page",
    SCIENTIFIC: "evidence page",
    STORY: "narrative page",
    BRIDGE: "bridge page",
    VIDEO_LETTER: "video page",
  };
  return id ? labels[id] ?? null : null;
}

export function audienceEnglish(label: string): string {
  if (label === "Homens") return "men";
  if (label === "Mulheres") return "women";
  return label;
}

export function emotionEnglish(text: string): string | null {
  if (text.startsWith("As páginas descrevem dor")) return "The measured pages describe pain.";
  if (text.startsWith("As páginas descrevem rigidez")) return "The measured pages describe stiffness.";
  if (text.startsWith("As páginas descrevem desconforto")) return "The measured pages describe discomfort.";
  if (text.startsWith("Os fatos trazem cautelas")) return "The product source lists cautions, so the measured tone is caution.";
  if (/^[\x00-\x7F]+$/.test(text)) return text;
  return null;
}

export function triggerEnglish(text: string): string | null {
  const faq = text.match(/^FAQ em (\d+) grupos$/);
  if (faq) return `Measured pages group questions in ${faq[1]} FAQ groups.`;
  if (text.startsWith("Menções:")) return `Measured mention types: ${text.slice("Menções:".length).trim()}.`;
  if (text.startsWith("Ausência de CTA")) return "No dominant call to action was measured.";
  if (/preço|price|usd|\$|garantia|guarantee/i.test(text)) return null;
  if (/^[\x00-\x7F]+$/.test(text)) return text;
  return null;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
