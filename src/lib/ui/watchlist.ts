import { marketDecisionLabel, marketLevelLabel, type MarketDecision, type MarketLevel } from "@/lib/ui/market-results";

export type WatchStatus = "pronto" | "analise" | "revisao" | "descartado";
export type WatchPriority = "high" | "medium" | "low";

export type WatchlistItem = {
  id: string;
  name: string;
  brand: string;
  priceLabel: string;
  keyword: string;
  country: string;
  competition: MarketLevel;
  recommendation: MarketDecision;
  confidence: number;
  addedOn: string;
  status: WatchStatus;
  priority: WatchPriority;
  tags: string[];
  notes: string;
};

export const watchStatusView: Record<WatchStatus, { tone: "success" | "warning" | "review" | "danger"; label: string }> = {
  pronto: { tone: "success", label: "Pronto para anunciar" },
  analise: { tone: "warning", label: "Em análise" },
  revisao: { tone: "review", label: "Aguardando revisão" },
  descartado: { tone: "danger", label: "Descartado" },
};

export const watchPriorityLabel: Record<WatchPriority, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const priorityOrder: Record<WatchPriority, number> = { high: 0, medium: 1, low: 2 };
const decisionOrder: Record<MarketDecision, number> = { proceed: 0, monitor: 1, skip: 2 };
const levelOrder: Record<MarketLevel, number> = { low: 0, medium: 1, high: 2 };

export const watchlistCatalog: WatchlistItem[] = [
  {
    id: "dynamic-joint",
    name: "Dynamic Joint",
    brand: "Stonehenge Health",
    priceLabel: "US$49.95",
    keyword: "joint pain supplement",
    country: "United States",
    competition: "medium",
    recommendation: "monitor",
    confidence: 82,
    addedOn: "2026-10-07",
    status: "analise",
    priority: "medium",
    tags: ["Suplemento"],
    notes: "",
  },
  {
    id: "north-offer",
    name: "North Offer",
    brand: "North Brand",
    priceLabel: "US$29.00",
    keyword: "joint pain supplement",
    country: "United States",
    competition: "low",
    recommendation: "proceed",
    confidence: 74,
    addedOn: "2026-10-05",
    status: "pronto",
    priority: "high",
    tags: ["Teste"],
    notes: "",
  },
  {
    id: "zebra-offer",
    name: "Zebra Offer",
    brand: "Zebra Brand",
    priceLabel: "US$39.50",
    keyword: "sleep aid",
    country: "United States",
    competition: "medium",
    recommendation: "monitor",
    confidence: 63,
    addedOn: "2026-10-02",
    status: "revisao",
    priority: "medium",
    tags: ["Revisão"],
    notes: "",
  },
  {
    id: "plain-offer",
    name: "Plain Offer",
    brand: "Plain Brand",
    priceLabel: "US$64.00",
    keyword: "blood sugar support",
    country: "Brazil",
    competition: "high",
    recommendation: "skip",
    confidence: 41,
    addedOn: "2026-09-20",
    status: "descartado",
    priority: "low",
    tags: ["ClickBank"],
    notes: "Concorrência alta.\nVerificar ClickBank.",
  },
  {
    id: "south-offer",
    name: "South Offer",
    brand: "South Brand",
    priceLabel: "US$19.00",
    keyword: "memory support",
    country: "Brazil",
    competition: "low",
    recommendation: "proceed",
    confidence: 55,
    addedOn: "2026-10-07",
    status: "pronto",
    priority: "high",
    tags: ["Novo"],
    notes: "",
  },
];

export const watchlistSeed = watchlistCatalog.filter((item) => item.id !== "south-offer");

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatWatchDate(iso: string) {
  const [year, month, day] = iso.split("-");
  const label = months[Number(month) - 1] ?? month;
  return `${day} ${label} ${year}`;
}

export function watchlistCounts(items: WatchlistItem[]) {
  return {
    total: String(items.length),
    pronto: String(items.filter((item) => item.status === "pronto").length),
    analise: String(items.filter((item) => item.status === "analise").length),
    revisao: String(items.filter((item) => item.status === "revisao").length),
    descartado: String(items.filter((item) => item.status === "descartado").length),
  };
}

export function sortWatchlist(items: WatchlistItem[], sort: string) {
  const rows = [...items];
  rows.sort((left, right) => {
    if (sort === "oldest") return left.addedOn.localeCompare(right.addedOn);
    if (sort === "priority") return priorityOrder[left.priority] - priorityOrder[right.priority];
    if (sort === "recommendation") return decisionOrder[left.recommendation] - decisionOrder[right.recommendation];
    if (sort === "competition") return levelOrder[left.competition] - levelOrder[right.competition];
    if (sort === "confidence") return right.confidence - left.confidence;
    return right.addedOn.localeCompare(left.addedOn);
  });
  return rows;
}

export { marketDecisionLabel, marketLevelLabel };
