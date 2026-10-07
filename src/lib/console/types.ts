export type WatchStatus = "pronto" | "analise" | "revisao" | "descartado";
export type WatchPriority = "high" | "medium" | "low";

export type ConsoleIssue = { field: string; message: string };

export type ConsoleProduct = {
  id: string;
  name: string;
  brand: string | null;
  priceLabel: string | null;
  currency: string | null;
  domain: string | null;
  category: string | null;
  language: string | null;
  landingPageId: string | null;
  httpStatus: number | null;
};

export type ConsoleLandingPage = {
  id: string;
  httpStatus: number;
  finalUrl: string;
  redirectCount: number;
  bytes: number;
};

export type ConsoleSearchRecord = {
  id: string;
  keyword: string;
  country: string;
  language: string;
  device: string;
  createdAt: string;
  status: "OK" | "REJECTED";
  issues: ConsoleIssue[];
  elapsedMs: number;
  sponsoredCount: number;
  organicCount: number;
  sponsoredTitles: string[];
  organicTitles: string[];
  landingPages: ConsoleLandingPage[];
  products: ConsoleProduct[];
  brands: string[];
  categories: string[];
  prices: string[];
  warnings: string[];
  missingEvidence: string[];
  metrics: Record<string, number | null>;
  recommendation: string | null;
  rank: string | null;
  score: string | null;
  googleAds: "Not Connected" | "Connected";
};

export type WatchEvent = { at: string; label: string };

export type WatchItem = {
  id: string;
  searchId: string;
  productId: string;
  name: string;
  brand: string | null;
  priceLabel: string | null;
  keyword: string;
  country: string;
  domain: string | null;
  landingPageId: string | null;
  status: WatchStatus;
  priority: WatchPriority;
  notes: string;
  addedOn: string;
  events: WatchEvent[];
};

export type CampaignDraftRecord = {
  id: string;
  searchId: string;
  productId: string;
  name: string;
  keyword: string;
  status: "PAUSED";
  googleAds: "Not Connected" | "Connected";
  sent: false;
  issues: string[];
  createdAt: string;
};
