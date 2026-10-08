export const marketCountries = [
  { value: "us", label: "Estados Unidos" },
  { value: "br", label: "Brasil" },
] as const;

export const marketLanguages = [
  { value: "en", label: "Inglês" },
  { value: "pt", label: "Português" },
] as const;

export const marketDevices = [
  { value: "desktop", label: "Computador" },
  { value: "mobile", label: "Celular" },
] as const;

export const landingPageLimits = [
  { value: "1", label: "1" },
  { value: "3", label: "3" },
  { value: "5", label: "5" },
] as const;

export const searchProviders = [{ value: "searchapi", label: "SearchApi" }] as const;

export const searchStatusLabel = {
  ready: "Pronto",
  searching: "Pesquisando",
  completed: "Concluída",
  failed: "Falhou",
} as const;

export type MarketSearchStatus = keyof typeof searchStatusLabel;
