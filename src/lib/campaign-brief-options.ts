export const MARKETPLACES = [
  { value: "clickbank", label: "ClickBank" },
  { value: "digistore24", label: "Digistore24" },
  { value: "cj", label: "CJ" },
  { value: "shareasale", label: "ShareASale" },
  { value: "impact", label: "Impact" },
  { value: "other", label: "Other" },
] as const;

export const COUNTRIES = [
  { value: "ZA", label: "África do Sul" },
  { value: "DE", label: "Alemanha" },
  { value: "AU", label: "Austrália" },
  { value: "AT", label: "Áustria" },
  { value: "BE", label: "Bélgica" },
  { value: "BR", label: "Brasil" },
  { value: "CA", label: "Canadá" },
  { value: "SG", label: "Cingapura" },
  { value: "KR", label: "Coreia do Sul" },
  { value: "DK", label: "Dinamarca" },
  { value: "AE", label: "Emirados Árabes Unidos" },
  { value: "ES", label: "Espanha" },
  { value: "US", label: "Estados Unidos" },
  { value: "FI", label: "Finlândia" },
  { value: "FR", label: "França" },
  { value: "NL", label: "Holanda" },
  { value: "IN", label: "Índia" },
  { value: "IE", label: "Irlanda" },
  { value: "IT", label: "Itália" },
  { value: "JP", label: "Japão" },
  { value: "MX", label: "México" },
  { value: "NO", label: "Noruega" },
  { value: "NZ", label: "Nova Zelândia" },
  { value: "PL", label: "Polônia" },
  { value: "PT", label: "Portugal" },
  { value: "GB", label: "Reino Unido" },
  { value: "SE", label: "Suécia" },
  { value: "CH", label: "Suíça" },
] as const;

export const LANGUAGES = [
  { value: "de", label: "Alemão" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "nl", label: "Holandês" },
  { value: "en", label: "Inglês" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
  { value: "pl", label: "Polonês" },
  { value: "pt", label: "Português" },
  { value: "sv", label: "Sueco" },
] as const;

export const CAMPAIGN_GOALS = [
  { value: "review", label: "Revisão" },
  { value: "educational", label: "Educativo" },
  { value: "comparison", label: "Comparação" },
  { value: "quiz", label: "Quiz" },
] as const;

export const RESEARCH_SOURCES = [
  { value: "competitors", label: "Pesquisar sites concorrentes" },
  { value: "reddit", label: "Pesquisar Reddit" },
  { value: "reviews", label: "Pesquisar avaliações do produto" },
  { value: "forums", label: "Pesquisar fóruns" },
  { value: "youtube", label: "Pesquisar YouTube" },
  { value: "google", label: "Pesquisar Google" },
  { value: "news", label: "Pesquisar notícias" },
] as const;

export const GENERATION_OPTIONS = [
  { value: "landingPage", label: "Gerar landing page" },
  { value: "headlines", label: "Gerar títulos do Google Ads" },
  { value: "descriptions", label: "Gerar descrições do Google Ads" },
  { value: "rsa", label: "Gerar recursos de RSA" },
  { value: "seo", label: "Gerar metadados de SEO" },
  { value: "faq", label: "Gerar FAQ" },
] as const;

export type Marketplace = (typeof MARKETPLACES)[number]["value"];
export type Country = (typeof COUNTRIES)[number]["value"];
export type Language = (typeof LANGUAGES)[number]["value"];
export type Goal = (typeof CAMPAIGN_GOALS)[number]["value"];
export type ResearchSource = (typeof RESEARCH_SOURCES)[number]["value"];
export type GenerationOption = (typeof GENERATION_OPTIONS)[number]["value"];

export function labelFor(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
