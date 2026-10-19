export const LANDING_GENERATION_STATUSES = ["waiting", "running", "completed", "error"] as const;

export type LandingGenerationStatus = (typeof LANDING_GENERATION_STATUSES)[number];

export const LANDING_GENERATION_STEPS = [
  { id: "facts", label: "Carregando Product Facts" },
  { id: "intelligence", label: "Analisando Inteligência de Mercado" },
  { id: "strategy", label: "Aplicando Estratégia" },
  { id: "structure", label: "Gerando Estrutura da Landing" },
  { id: "headlines", label: "Escrevendo Headlines" },
  { id: "hero", label: "Criando Hero" },
  { id: "benefits", label: "Criando Benefícios" },
  { id: "faq", label: "Criando FAQ" },
  { id: "cta", label: "Criando CTA" },
  { id: "seo", label: "Gerando SEO" },
  { id: "schema", label: "Gerando Schema" },
  { id: "assets", label: "Selecionando Assets" },
  { id: "ads", label: "Preparando Google Ads" },
  { id: "validation", label: "Validando Landing" },
  { id: "preview", label: "Criando Preview" },
  { id: "ready", label: "Landing pronta" },
] as const;

export type LandingGenerationStepId = (typeof LANDING_GENERATION_STEPS)[number]["id"];

export type LandingGenerationProgress = Partial<Record<LandingGenerationStepId, LandingGenerationStatus>>;
