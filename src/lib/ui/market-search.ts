export const marketCountries = [
  { value: "us", label: "United States" },
  { value: "br", label: "Brazil" },
] as const;

export const marketLanguages = [
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
] as const;

export const marketDevices = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
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
