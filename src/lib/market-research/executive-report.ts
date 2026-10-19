import type { MarketEvidence, MarketResearchReport, MarketSourceClass, QueryFamilyId } from "@/lib/market-research/types";

const CLASS_LABEL: Record<MarketSourceClass, string> = {
  BRAND: "Marca",
  SELLER: "Vendedor",
  RETAILER: "Varejista",
  EDITORIAL: "Editorial",
  "FORUM/COMMUNITY": "Fórum",
  OTHER: "Outra",
  UNKNOWN: "Desconhecida",
};

const FAMILY_LABEL: Record<QueryFamilyId, string> = {
  PRODUCT: "Produto",
  PURCHASE_INTENT: "Intenção de compra",
  CATEGORY_INTENT: "Categoria",
  QUESTIONS_OBJECTIONS: "Dúvidas e objeções",
};

const NOT_FOUND = "Não encontrado durante a pesquisa.";
const OBSERVED = "Lido nas páginas abertas. Não é um fato do produto.";

export type ExecutiveCompetitor = {
  name: string;
  type: string;
  domain: string;
  classification: string;
  used: string;
};

export type ExecutiveEvidenceRow = {
  text: string;
  source: string;
  domain: string;
  occurrences: string;
};

export type ExecutiveHeadline = {
  headline: string;
  domain: string;
  type: string;
};

export type ExecutiveCount = {
  label: string;
  count: string;
  position: string;
};

export type ExecutiveKeyword = {
  keyword: string;
  volume: string;
  origin: string;
};

export type ExecutivePrice = {
  product: string;
  price: string;
  source: string;
  domain: string;
};

export type ExecutiveSource = {
  domain: string;
  type: string;
  classification: string;
  pages: string;
};

export type ExecutiveRisk = {
  claim: string;
  origin: string;
  source: string;
  domain: string;
  risk: string;
};

export type ExecutiveAudience = {
  men: string;
  women: string;
  age: string;
  pains: string;
  goals: string;
  questions: string[];
  personas: string;
};

export type ExecutiveTechnical = {
  quality: string;
  confidence: string;
  validity: string;
  provider: string;
  duration: string;
  queries: string[];
  classes: string[];
  families: string[];
  hosts: string[];
  pages: string;
  averagePage: string;
  json: string;
};

export type ExecutiveReport = {
  summary: string[];
  competitors: ExecutiveCompetitor[];
  benefitsNote: string;
  benefits: ExecutiveEvidenceRow[];
  ingredientsNote: string;
  ingredients: ExecutiveEvidenceRow[];
  objectionsNote: string;
  objections: ExecutiveEvidenceRow[];
  headlines: ExecutiveHeadline[];
  ctasNote: string;
  ctas: ExecutiveCount[];
  structuresNote: string;
  structures: Array<{ structure: string; frequency: string }>;
  keywordsNote: string;
  keywords: ExecutiveKeyword[];
  pricesNote: string;
  prices: ExecutivePrice[];
  guaranteesNote: string;
  guarantees: ExecutiveEvidenceRow[];
  claimsNote: string;
  claims: ExecutiveEvidenceRow[];
  faqNote: string;
  faqs: Array<{ question: string; answer: string; domain: string }>;
  scientificNote: string;
  scientific: Array<{ ingredient: string; type: string; source: string; domain: string }>;
  risksNote: string;
  risks: ExecutiveRisk[];
  opportunities: string[];
  audience: ExecutiveAudience;
  sourcesNote: string;
  sources: ExecutiveSource[];
  technical: ExecutiveTechnical;
};

export type ExecutiveTechnicalContext = {
  confidence: string;
  duration: string;
  validity: string;
};

function plain(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function classLabel(value: MarketSourceClass): string {
  return CLASS_LABEL[value] ?? value;
}

function familyLabel(value: QueryFamilyId): string {
  return FAMILY_LABEL[value] ?? value;
}

function hostLabel(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length !== 2) return host || domain;
  const label = parts[0] || host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function blobOf(source: MarketEvidence): string {
  return plain(`${source.title} ${source.relevantEvidence}`);
}

function findSource(sources: MarketEvidence[], text: string): MarketEvidence | undefined {
  const needle = plain(text).toLowerCase();
  if (!needle) return undefined;
  const slice = needle.slice(0, 80);
  return sources.find((source) => {
    const blob = blobOf(source).toLowerCase();
    const title = plain(source.title).toLowerCase();
    return blob.includes(slice) || (title.length > 0 && needle.includes(title));
  });
}

function occurrenceCount(sources: MarketEvidence[], text: string): number {
  const needle = plain(text).toLowerCase().slice(0, 80);
  if (!needle) return 0;
  return sources.filter((source) => blobOf(source).toLowerCase().includes(needle)).length;
}

function evidenceRow(sources: MarketEvidence[], text: string): ExecutiveEvidenceRow {
  const match = findSource(sources, text);
  const count = occurrenceCount(sources, text);
  return {
    text: plain(text),
    source: match ? plain(match.title) || "Sem título" : "Não associada",
    domain: match?.domain || "Não associado",
    occurrences: count > 0 ? String(count) : "1",
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = plain(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summaryOf(report: MarketResearchReport): string[] {
  const sources = counted(report.sources.length, "fonte utilizável", "fontes utilizáveis");
  const domains = counted(report.diversity.UNIQUE_DOMAINS, "domínio", "domínios");
  const queries = counted(report.queriesUsed.length, "consulta", "consultas");
  const lead = report.sources.length === 1
    ? `Foi analisada ${sources}, em ${domains}, a partir de ${queries}.`
    : `Foram analisadas ${sources}, em ${domains}, a partir de ${queries}.`;
  const lines = [lead];
  const classes = report.diversity.SOURCE_CLASSES.map(classLabel);
  if (classes.length > 0) lines.push(`A classe presente nas fontes é ${classes.join(", ")}.`);
  const terms = report.signals.recurringTerminology.slice(0, 4).map(plain).filter(Boolean);
  if (terms.length > 0) lines.push(`A terminologia que mais se repetiu nos trechos inclui ${terms.join(", ")}.`);
  const objections = report.signals.commonObjections.length;
  lines.push(
    objections === 0
      ? "Nenhuma objeção foi registrada nos trechos coletados."
      : `Foram registrados ${objections} trechos com sinal de objeção, segurança ou preço.`,
  );
  if (report.signals.reviewOrientedResults > 0) {
    const reviews = report.signals.reviewOrientedResults;
    lines.push(reviews === 1
      ? "Há 1 sinal de review nos resultados guardados."
      : `Há ${reviews} sinais de review nos resultados guardados.`);
  }
  return lines;
}

function opportunitiesOf(report: MarketResearchReport): string[] {
  const lines: string[] = [];
  const classes = report.diversity.SOURCE_CLASSES;
  if (classes.length === 1) {
    lines.push(`As fontes utilizáveis ficaram concentradas na classe ${classLabel(classes[0]!)}.`);
  }
  if (!classes.includes("FORUM/COMMUNITY") && !classes.includes("SELLER") && !classes.includes("RETAILER")) {
    lines.push("Este relatório não inclui fontes de fórum, vendedor ou varejista.");
  }
  if (report.signals.commonObjections.length === 0) {
    lines.push("Nenhuma objeção foi registrada nos trechos coletados.");
  } else if (report.signals.commonObjections.length <= 2) {
    lines.push(`O relatório registra ${report.signals.commonObjections.length} trechos com sinal de objeção, segurança ou preço.`);
  }
  const opened = (report.pageInsights ?? []).filter((item) => item.status === "ENRICHED" || item.status === "CACHED").length;
  if (opened > 0) lines.push(`Foram abertas ${opened} páginas utilizáveis.`);
  for (const family of report.queryFamilies) {
    const covered = report.sources.some((source) => source.usable && source.queryFamily === family.family);
    if (!covered) lines.push(`A família ${familyLabel(family.family)} não trouxe página utilizável.`);
  }
  if (lines.length === 0) lines.push("O relatório não mostrou uma lacuna adicional além das fontes já listadas.");
  return lines;
}

export function buildExecutiveReport(report: MarketResearchReport, context: ExecutiveTechnicalContext): ExecutiveReport {
  const sources = report.sources;
  const competitors = new Map<string, ExecutiveCompetitor>();
  for (const source of sources) {
    if (!source.domain || source.classification === "BRAND" || source.classification === "UNKNOWN") continue;
    const current = competitors.get(source.domain);
    if (current) {
      if (source.usable) current.used = "Sim";
      continue;
    }
    competitors.set(source.domain, {
      name: hostLabel(source.domain),
      type: classLabel(source.classification),
      domain: source.domain,
      classification: source.classification,
      used: source.usable ? "Sim" : "Não",
    });
  }

  const pages = new Map<string, { source: MarketEvidence; count: number }>();
  for (const source of sources) {
    if (!source.domain) continue;
    const current = pages.get(source.domain);
    if (current) current.count += 1;
    else pages.set(source.domain, { source, count: 1 });
  }

  const phrase = (text: string, source: string, domain: string, count: number): ExecutiveEvidenceRow => ({
    text: plain(text),
    source: plain(source) || domain,
    domain,
    occurrences: String(count),
  });
  const benefits = (report.benefits ?? []).map((item) => phrase(item.text, item.source, item.domain, item.count));
  const ingredients = (report.ingredients ?? []).map((item) => phrase(item.name, item.source, item.domain, 1));
  const claims = (report.claims ?? []).map((item) => phrase(item.text, item.source, item.domain, item.count));
  const ctas = (report.ctaPatterns ?? []).map((item) => ({
    label: item.text,
    position: item.position,
    count: String(item.frequency),
  }));
  const prices = (report.pricing ?? []).map((item) => ({
    product: "Não identificado",
    price: item.price,
    source: item.source,
    domain: item.domain,
  }));
  const guarantees = (report.guarantees ?? []).map((item) => phrase(
    item.days ? `${item.text} (${item.days} dias)` : item.text,
    item.source,
    item.domain,
    1,
  ));
  const scientific = (report.scientificEvidence ?? []).map((item) => ({
    ingredient: item.ingredient,
    type: item.type,
    source: item.source,
    domain: item.domain,
  }));
  const risks = (report.policyRisks ?? []).map((item) => ({
    claim: item.claim,
    origin: item.source,
    source: item.source,
    domain: item.domain,
    risk: item.risk,
  }));
  const structures = (report.landingStructures ?? []).map((item) => ({
    structure: item.structure,
    frequency: String(item.frequency),
  }));
  const faqs = (report.faq ?? []).map((item) => ({
    question: plain(item.question),
    answer: plain(item.answer),
    domain: item.domain,
  }));
  const audience = report.audience;
  const listed = (values: string[] | undefined) => {
    const clean = (values ?? []).map(plain).filter(Boolean);
    return clean.length > 0 ? clean.join("; ") : NOT_FOUND;
  };
  const enriched = (report.pageInsights ?? []).filter((item) => item.status === "ENRICHED");
  const averageMs = enriched.length > 0
    ? Math.round(enriched.reduce((sum, item) => sum + item.durationMs, 0) / enriched.length)
    : null;

  const usable = sources.filter((source) => source.usable).length || sources.length;
  const keywords = report.signals.recurringTerminology.map((term) => {
    const count = sources.filter((source) => blobOf(source).toLowerCase().includes(plain(term).toLowerCase())).length;
    return {
      keyword: plain(term),
      volume: `${count} de ${usable} fontes`,
      origin: "Trechos das fontes",
    };
  }).filter((item) => item.keyword);

  const headlines = sources
    .map((source) => ({
      headline: plain(source.title),
      domain: source.domain,
      type: classLabel(source.classification),
    }))
    .filter((item) => item.headline);

  const sourceRows = [...pages.values()].map((item) => ({
    domain: item.source.domain,
    type: classLabel(item.source.classification),
    classification: item.source.classification,
    pages: String(item.count),
  }));

  return {
    summary: summaryOf(report),
    competitors: [...competitors.values()],
    benefitsNote: benefits.length > 0 ? OBSERVED : NOT_FOUND,
    benefits,
    ingredientsNote: ingredients.length > 0 ? OBSERVED : NOT_FOUND,
    ingredients,
    objectionsNote: "Cada linha é um trecho em que o motor viu sinal de objeção, segurança ou preço. A quantidade é o número de páginas guardadas em que esse trecho aparece.",
    objections: unique(report.signals.commonObjections).map((text) => evidenceRow(sources, text)),
    headlines,
    ctasNote: ctas.length > 0 ? OBSERVED : NOT_FOUND,
    ctas,
    structuresNote: structures.length > 0 ? OBSERVED : NOT_FOUND,
    structures,
    keywordsNote: "O volume é a presença do termo nas páginas guardadas. O relatório não traz volume de busca.",
    keywords,
    pricesNote: prices.length > 0 ? OBSERVED : NOT_FOUND,
    prices,
    guaranteesNote: guarantees.length > 0 ? OBSERVED : NOT_FOUND,
    guarantees,
    claimsNote: claims.length > 0 ? OBSERVED : NOT_FOUND,
    claims,
    faqNote: faqs.length > 0 ? OBSERVED : NOT_FOUND,
    faqs,
    scientificNote: scientific.length > 0 ? "Menção encontrada na página. O relatório não traz quantidade de estudos nem nível de evidência." : NOT_FOUND,
    scientific,
    risksNote: risks.length > 0 ? OBSERVED : NOT_FOUND,
    risks,
    opportunities: opportunitiesOf(report),
    audience: {
      men: listed((audience?.sexes ?? []).filter((item) => item === "Homens")),
      women: listed((audience?.sexes ?? []).filter((item) => item === "Mulheres")),
      age: listed(audience?.ages),
      pains: listed(audience?.pains),
      goals: listed(audience?.goals),
      personas: listed(audience?.personas),
      questions: unique(report.signals.commonQuestions),
    },
    sourcesNote: `O motor guardou ${sources.length} páginas utilizáveis. A busca viu ${report.diversity.SEARCH_RESULTS_TOTAL} resultados antes desse recorte.`,
    sources: sourceRows,
    technical: {
      quality: report.quality,
      confidence: context.confidence,
      validity: context.validity,
      provider: report.searchProvider.name,
      duration: context.duration,
      queries: report.queriesUsed,
      classes: report.diversity.SOURCE_CLASSES.map(classLabel),
      families: report.queryFamilies.map((item) => familyLabel(item.family)),
      hosts: sourceRows.map((item) => item.domain),
      pages: enriched.length > 0 ? String(enriched.length) : NOT_FOUND,
      averagePage: averageMs === null ? NOT_FOUND : averageMs < 1000 ? `${averageMs} ms` : `${(averageMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`,
      json: JSON.stringify(report, null, 2),
    },
  };
}
