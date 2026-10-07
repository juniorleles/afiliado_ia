import type { BadgeStatus } from "@/components/ui/badge";
import { marketCountries, marketDevices, marketLanguages } from "@/lib/ui/market-search";

export type MarketLevel = "low" | "medium" | "high";
export type MarketDecision = "proceed" | "monitor" | "skip";

export type MarketProduct = {
  id: string;
  name: string;
  brand: string;
  price: number;
  priceLabel: string;
  landingPage: boolean;
  observedAds: number;
  competition: MarketLevel;
  recommendation: MarketDecision;
  badge: BadgeStatus;
  confidence: number;
  country: string;
};

export const marketLevelLabel: Record<MarketLevel, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const marketDecisionLabel: Record<MarketDecision, string> = {
  proceed: "Seguir",
  monitor: "Monitorar",
  skip: "Evitar",
};

export const marketProducts: MarketProduct[] = [
  {
    id: "dynamic-joint",
    name: "Dynamic Joint",
    brand: "Stonehenge Health",
    price: 49.95,
    priceLabel: "US$49.95",
    landingPage: true,
    observedAds: 37,
    competition: "medium",
    recommendation: "monitor",
    badge: "monitorar",
    confidence: 82,
    country: "United States",
  },
  {
    id: "north-offer",
    name: "North Offer",
    brand: "North Brand",
    price: 29,
    priceLabel: "US$29.00",
    landingPage: true,
    observedAds: 12,
    competition: "low",
    recommendation: "proceed",
    badge: "excelente",
    confidence: 74,
    country: "United States",
  },
  {
    id: "plain-offer",
    name: "Plain Offer",
    brand: "Plain Brand",
    price: 64,
    priceLabel: "US$64.00",
    landingPage: false,
    observedAds: 4,
    competition: "high",
    recommendation: "skip",
    badge: "evitar",
    confidence: 41,
    country: "Brazil",
  },
  {
    id: "zebra-offer",
    name: "Zebra Offer",
    brand: "Zebra Brand",
    price: 39.5,
    priceLabel: "US$39.50",
    landingPage: true,
    observedAds: 18,
    competition: "medium",
    recommendation: "monitor",
    badge: "revisar",
    confidence: 63,
    country: "United States",
  },
];

export const marketHealth = {
  competition: "Média" as const,
  activity: "Média" as const,
  recommendation: "Monitorar" as const,
};

export const marketSide = {
  topBrand: "Stonehenge Health",
  averagePrice: "US$45.61",
  productsFound: String(marketProducts.length),
  sponsoredRatio: "82%",
};

const summaryDefaults = {
  keyword: "joint pain supplement",
  country: "us",
  language: "en",
  device: "desktop",
};

function knownLabel(options: readonly { value: string; label: string }[], value: string | undefined, fallback: string) {
  if (!value) return options.find((option) => option.value === fallback)?.label ?? fallback;
  return options.find((option) => option.value === value)?.label ?? options.find((option) => option.value === fallback)?.label ?? fallback;
}

export function marketSummary(input: { keyword?: string; country?: string; language?: string; device?: string }) {
  const keyword = input.keyword?.trim() || summaryDefaults.keyword;
  return {
    keyword,
    country: knownLabel(marketCountries, input.country, summaryDefaults.country),
    language: knownLabel(marketLanguages, input.language, summaryDefaults.language),
    device: knownLabel(marketDevices, input.device, summaryDefaults.device),
    searchTime: "2,6 s",
    provider: "Exemplo local",
    sponsored: "37",
    organic: "8",
    landingPages: "3",
    products: String(marketProducts.length),
  };
}

export function findMarketProduct(id?: string) {
  return marketProducts.find((product) => product.id === id) ?? marketProducts[0];
}
