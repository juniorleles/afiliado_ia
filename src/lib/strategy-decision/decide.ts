import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { ProductFacts } from "@/lib/product-facts";

export const APPROACH_IDS = [
  "REVIEW",
  "EDUCATIONAL",
  "BUYER_GUIDE",
  "COMPARISON",
  "QUIZ",
  "LONG_FORM",
  "MEDICAL",
  "AUTHORITY",
  "SCIENTIFIC",
  "STORY",
  "BRIDGE",
  "VIDEO_LETTER",
] as const;

export type ApproachId = (typeof APPROACH_IDS)[number];

export const APPROACH_LABEL: Record<ApproachId, string> = {
  REVIEW: "Revisão",
  EDUCATIONAL: "Educativo",
  BUYER_GUIDE: "Guia de compra",
  COMPARISON: "Comparação",
  QUIZ: "Quiz",
  LONG_FORM: "Página longa",
  MEDICAL: "Médico",
  AUTHORITY: "Autoridade",
  SCIENTIFIC: "Científico",
  STORY: "História",
  BRIDGE: "Página de ponte",
  VIDEO_LETTER: "Carta em vídeo",
};

export type StrategyDecision = {
  recommendedApproach: string;
  approachId: ApproachId;
  confidence: number;
  reasoning: string[];
  targetAudience: string;
  awarenessStage: string;
  marketSophistication: string;
  copyAngle: string;
  persuasionTriggers: string[];
  emotionalDrivers: string[];
  objectionsToAnswer: string[];
  claimsToAvoid: string[];
  seoDirection: string;
  landingStructure: string;
  contentPriority: string;
  adDirection: string;
  validationNotes: string;
  basedOn: { researchedAt: string | null; factsFingerprint: string };
};

const TIE_ORDER: ApproachId[] = [
  "EDUCATIONAL",
  "BUYER_GUIDE",
  "REVIEW",
  "AUTHORITY",
  "SCIENTIFIC",
  "COMPARISON",
  "LONG_FORM",
  "BRIDGE",
  "STORY",
  "QUIZ",
  "MEDICAL",
  "VIDEO_LETTER",
];

export type DecisionShell = "REVIEW" | "EDUCATIONAL" | "BUYER_GUIDE";

const SHELL: Record<ApproachId, DecisionShell> = {
  REVIEW: "REVIEW",
  STORY: "REVIEW",
  BRIDGE: "REVIEW",
  VIDEO_LETTER: "REVIEW",
  EDUCATIONAL: "EDUCATIONAL",
  SCIENTIFIC: "EDUCATIONAL",
  MEDICAL: "EDUCATIONAL",
  AUTHORITY: "EDUCATIONAL",
  LONG_FORM: "EDUCATIONAL",
  BUYER_GUIDE: "BUYER_GUIDE",
  COMPARISON: "BUYER_GUIDE",
  QUIZ: "BUYER_GUIDE",
};

export function decisionShell(approachId: ApproachId): DecisionShell {
  return SHELL[approachId];
}

export function factsFingerprint(facts: ProductFacts): string {
  const body = [
    facts.productName,
    facts.description ?? "",
    facts.features.join("|"),
    facts.ingredientsOrComponents.join("|"),
    facts.usageInformation.join("|"),
    facts.cautions.join("|"),
    facts.guaranteeInformation ?? "",
    facts.pricingInformation ?? "",
    facts.importQuality,
    (facts.videoUrls ?? []).join("|"),
  ].join("\n");
  let hash = 0;
  for (let index = 0; index < body.length; index += 1) hash = (Math.imul(hash, 33) + body.charCodeAt(index)) >>> 0;
  return hash.toString(16);
}

function patternPercent(analysis: MarketIntelligenceAnalysis | null, name: string): number {
  return analysis?.dominantHeadlinePatterns.find((item) => item.pattern === name)?.percent ?? 0;
}

function editorialShare(analysis: MarketIntelligenceAnalysis | null): { count: number; editorial: number } {
  const rows = analysis?.competitorsRank ?? [];
  return { count: rows.length, editorial: rows.filter((item) => item.classification === "EDITORIAL").length };
}

export function decideStrategy(input: { facts: ProductFacts; analysis: MarketIntelligenceAnalysis | null }): StrategyDecision {
  const { facts, analysis } = input;
  const scores = new Map<ApproachId, { points: number; reasons: string[] }>();
  for (const id of APPROACH_IDS) scores.set(id, { points: 0, reasons: [] });
  const add = (id: ApproachId, points: number, reason: string) => {
    const row = scores.get(id);
    if (!row || points <= 0) return;
    row.points += points;
    row.reasons.push(reason);
  };

  const review = patternPercent(analysis, "Review");
  const question = patternPercent(analysis, "Pergunta");
  const comparison = patternPercent(analysis, "Comparação");
  const problem = patternPercent(analysis, "Problema");
  const scientificHeadlines = patternPercent(analysis, "Científico");
  const hosts = editorialShare(analysis);
  const sections = analysis?.dominantStructure.sections ?? [];
  const faqSection = sections.find((item) => item.name === "FAQ")?.percent ?? 0;
  const opened = sections[0] ? Math.round((sections[0].count * 100) / Math.max(sections[0].percent, 1)) : 0;
  const faqGroups = analysis?.dominantFaq.length ?? 0;
  const science = analysis?.dominantScientificTopics ?? [];
  const scienceUntied = (analysis?.opportunities ?? []).some((item) => item.reason.includes("ingrediente extraído"));
  const prohibited = analysis?.dominantClaims.prohibited ?? [];
  const risky = analysis?.dominantClaims.risky ?? [];
  const factsThin = facts.importQuality === "INSUFFICIENT" || (facts.features.length === 0 && facts.ingredientsOrComponents.length === 0 && !facts.description?.trim());
  const hasIngredients = facts.ingredientsOrComponents.length > 0;
  const hasGuarantee = Boolean(facts.guaranteeInformation?.trim()) || Boolean(analysis?.dominantGuarantee.label);
  const hasVideo = (facts.videoUrls ?? []).length > 0;
  const noCta = Boolean(analysis) && !analysis?.dominantCTA.text;
  const buyerIntent = analysis?.marketSummary.buyerIntent ?? "";

  if (review > 0) add("REVIEW", review / 10, `${review}% das headlines analisadas seguem o padrão Review.`);
  if (hosts.count >= 3 && hosts.editorial === hosts.count) add("REVIEW", 2, `Os ${hosts.count} concorrentes classificados são editoriais.`);
  if (hosts.count >= 3 && hosts.editorial === hosts.count) add("AUTHORITY", 2, `${hosts.editorial} de ${hosts.count} domínios são editoriais.`);
  if (question > 0) add("EDUCATIONAL", question / 10, `${question}% das headlines são perguntas.`);
  if (faqSection > 0) add("BUYER_GUIDE", faqSection / 25, `FAQ apareceu em ${faqSection}% das páginas abertas.`);
  if (faqGroups >= 3) add("EDUCATIONAL", 2, `Há ${faqGroups} grupos de perguntas nas páginas abertas.`);
  if (noCta) add("BUYER_GUIDE", 3, "Nenhum CTA dominante foi encontrado nas páginas abertas.");
  if (buyerIntent === "Moderada") add("BUYER_GUIDE", 3, "A intenção de compra medida na análise é moderada.");
  if (buyerIntent === "Fraca") add("EDUCATIONAL", 2, "A intenção de compra medida na análise é fraca.");
  if (hasGuarantee && analysis?.dominantGuarantee.label) add("BUYER_GUIDE", 2, `A garantia mais frequente é ${analysis.dominantGuarantee.label}, em ${analysis.dominantGuarantee.count} ocorrências.`);
  if (factsThin && analysis) add("BUYER_GUIDE", 2, "Os fatos do produto não sustentam uma página de afirmações.");
  if (comparison > 0) add("COMPARISON", comparison / 10, `${comparison}% das headlines seguem o padrão Comparação.`);
  if (hosts.count >= 5) add("COMPARISON", 2, `A análise lista ${hosts.count} domínios concorrentes.`);
  const comparisonFaqs = (analysis?.dominantFaq ?? []).filter((item) => /\b(worth|vs\.?|alternative|compar)/i.test(`${item.label} ${item.examples.join(" ")}`));
  if (comparisonFaqs.length > 0) add("COMPARISON", 2, `${comparisonFaqs.length} grupos de FAQ comparam ou perguntam se vale a pena.`);
  if (sections.length >= 4 && faqGroups >= 4) add("LONG_FORM", 3, `Há ${sections.length} seções recorrentes e ${faqGroups} grupos de FAQ.`);
  if (science.length > 0) add("SCIENTIFIC", Math.min(4, science.length), `As páginas citam ${science.map((item) => item.type).join(", ")}.`);
  if (science.length > 0 && hasIngredients && !scienceUntied) add("SCIENTIFIC", 3, "Os fatos trazem ingredientes e a análise liga menções científicas a eles.");
  if (scienceUntied) add("AUTHORITY", 2, "Há menções científicas, mas nenhuma está ligada a um ingrediente extraído.");
  if (scientificHeadlines > 0) add("SCIENTIFIC", scientificHeadlines / 10, `${scientificHeadlines}% das headlines usam vocabulário científico.`);
  if (hasIngredients && facts.usageInformation.length > 0 && facts.cautions.length > 0) {
    add("EDUCATIONAL", 2, "Os fatos trazem ingredientes, uso e cautelas.");
    if (analysis && prohibited.length === 0) add("MEDICAL", 3, "Os fatos trazem ingredientes, uso e cautelas, e a análise não registrou claim proibido.");
  }
  const questionPains = (analysis?.dominantAudience.pains ?? []).filter((item) => item.includes("?")).length;
  if (questionPains >= 2) add("QUIZ", 2, `${questionPains} trechos de público são perguntas dirigidas ao leitor.`);
  if ((facts.description?.trim().length ?? 0) > 400 && review < 30) add("STORY", 2, "A descrição nos fatos é longa e o padrão Review não domina as headlines.");
  if (noCta && (facts.pricingInformation?.trim() || facts.guaranteeInformation?.trim())) add("BRIDGE", 2, "Os fatos trazem oferta ou garantia e as páginas abertas não têm CTA dominante.");
  if (hasVideo) add("VIDEO_LETTER", 5, `Os fatos registram ${(facts.videoUrls ?? []).length} vídeo(s) do produto.`);
  if (problem > 0 && review < 40) add("EDUCATIONAL", problem / 20, `${problem}% das headlines descrevem um problema.`);

  const ranked = [...scores.entries()].sort((a, b) => b[1].points - a[1].points || TIE_ORDER.indexOf(a[0]) - TIE_ORDER.indexOf(b[0]));
  const [winnerId, winner] = ranked[0] ?? ["EDUCATIONAL", { points: 0, reasons: [] }];
  const approachId: ApproachId = winner.points > 0 ? winnerId : "EDUCATIONAL";
  const reasoning = winner.points > 0 ? winner.reasons : [
    analysis ? "Nenhum padrão medido ficou forte o bastante para outra abordagem." : "Não há MarketIntelligenceAnalysis salva.",
    factsThin ? "Os fatos do produto estão insuficientes." : "Os fatos não trazem vídeo, ingredientes com uso e cautela, nem uma oferta para outra abordagem.",
    "A abordagem Educativo limita a página ao que os fatos sustentarem.",
  ];

  const claimsToAvoid = [...prohibited, ...risky].map((item) => `${item.text} (${item.level}, ${item.count})`);
  const objections = [
    ...(analysis?.dominantObjections ?? []).map((item) => item.text),
    ...(analysis?.dominantFaq ?? []).filter((item) => /\b(side effect|scam|worth|guarantee|how long|complaint)\b/i.test(item.label)).map((item) => item.label),
  ].filter((item, index, all) => item.trim() && all.indexOf(item) === index).slice(0, 6);

  const audienceParts = [
    ...(analysis?.dominantAudience.sexes ?? []).map((item) => `${item.label} em ${item.count} ${item.count === 1 ? "página" : "páginas"}`),
    ...(analysis?.dominantAudience.ages ?? []),
  ];
  const painCount = analysis?.dominantAudience.pains.length ?? 0;
  const goalCount = analysis?.dominantAudience.goals.length ?? 0;
  if (painCount > 0) audienceParts.push(`${painCount} problemas descritos nas páginas`);
  if (goalCount > 0) audienceParts.push(`${goalCount} objetivos descritos nas páginas`);
  const targetAudience = audienceParts.length > 0 ? audienceParts.join(". ") + "." : "Público não medido nos fatos nem na análise.";

  const productFaq = (analysis?.dominantFaq ?? []).some((item) => facts.productName && item.label.toLowerCase().includes(facts.productName.toLowerCase()));
  const awarenessStage = analysis?.dominantCTA.text && (analysis.dominantPricing.count > 0) && hasGuarantee
    ? "Most Aware"
    : review >= 40 || productFaq
      ? "Product Aware"
      : problem >= 20 || painCount > 0
        ? "Problem Aware"
        : (analysis?.dominantBenefits.length ?? 0) > 0
          ? "Solution Aware"
          : "Unaware";

  const marketSophistication = !analysis
    ? "Sofisticação não medida. Não há análise de mercado salva."
    : prohibited.length > 0 && review >= 50
      ? "Estágio 5 — identificação. Reviews e claims de risco já ocupam o mercado, e os fatos não trazem um mecanismo novo."
      : science.length > 0
        ? "Estágio 4 — mecanismo. As páginas falam de evidência científica."
        : hosts.count >= 5 || comparison > 0
          ? "Estágio 3 — mecanismo. Há concorrentes ou comparação bastante para o leitor já conhecer a categoria."
          : (analysis.dominantBenefits[0]?.count ?? 0) > 1
            ? "Estágio 2 — ampliação. Um benefício se repete nas páginas."
            : "Estágio 1 — claim simples. A análise não mostra um mercado saturado de promessas.";

  const angleLead: Record<ApproachId, string> = {
    REVIEW: review > 0 ? `Revisão, porque ${review}% das headlines seguem esse padrão.` : "Revisão do que os fatos permitem conferir.",
    EDUCATIONAL: "Explicar só o que os fatos sustentam, porque o mercado não mostrou um padrão mais forte.",
    BUYER_GUIDE: noCta
      ? `Critérios de compra, porque não há CTA dominante${hosts.count > 0 && hosts.editorial === hosts.count ? " e os concorrentes medidos são editoriais" : ""}.`
      : analysis?.dominantGuarantee.label
        ? `Critérios de compra em torno da garantia ${analysis.dominantGuarantee.label}.`
        : "Critérios de compra a partir das perguntas medidas.",
    COMPARISON: "Comparar critérios que as páginas já perguntam, sem inventar um vencedor.",
    QUIZ: "Perguntas que as próprias páginas fazem ao leitor, sem transformar isso em diagnóstico.",
    LONG_FORM: "Uma página longa porque várias seções e grupos de FAQ se repetem.",
    MEDICAL: "Uso e cautelas que já estão nos fatos, sem ampliar o efeito.",
    AUTHORITY: "Autoridade editorial, porque os domínios medidos são editoriais e a evidência citada não está ligada a um ingrediente.",
    SCIENTIFIC: "O que as páginas chamam de evidência, sem tratar menção como prova do produto.",
    STORY: "A narrativa que já está na descrição dos fatos.",
    BRIDGE: "A oferta que já está nos fatos, porque as páginas abertas não têm um CTA dominante.",
    VIDEO_LETTER: "O vídeo que já está nos fatos do produto.",
  };

  const triggers: string[] = [];
  if (analysis?.dominantGuarantee.label) triggers.push(`${analysis.dominantGuarantee.label} (${analysis.dominantGuarantee.count})`);
  if (faqGroups > 0) triggers.push(`FAQ em ${faqGroups} grupos`);
  if (science.length > 0) triggers.push(`Menções: ${science.map((item) => item.type).join(", ")}`);
  if (noCta) triggers.push("Ausência de CTA dominante");
  if (analysis && analysis.dominantPricing.count > 0 && analysis.dominantPricing.predominant !== null && analysis.dominantPricing.currency) {
    triggers.push(`Preço modal ${analysis.dominantPricing.currency} ${analysis.dominantPricing.predominant} em ${analysis.dominantPricing.count} valores`);
  }

  const painText = (analysis?.dominantAudience.pains ?? []).join(" ").toLowerCase();
  const emotions: string[] = [];
  if (/\bpain\b|\bache\b/.test(painText)) emotions.push("As páginas descrevem dor.");
  if (/stiff/.test(painText)) emotions.push("As páginas descrevem rigidez.");
  if (/discomfort/.test(painText)) emotions.push("As páginas descrevem desconforto.");
  if (emotions.length === 0 && facts.cautions.length > 0) emotions.push("Os fatos trazem cautelas, então a emoção medida é precaução.");
  if (emotions.length === 0) emotions.push("Nenhuma emoção foi medida além do que está nos textos salvos.");

  const keywords = (analysis?.dominantKeywords ?? []).slice(0, 5).map((item) => `${item.keyword} (${item.count})`);
  const seoDirection = keywords.length > 0
    ? `As palavras medidas nos trechos são ${keywords.join(", ")}. O relatório não traz volume de busca.`
    : `Não há palavra-chave medida. A única identidade disponível é o nome nos fatos${facts.productName ? `: ${facts.productName}` : ""}.`;

  const structure = sections.length > 0
    ? `Seções presentes: ${sections.map((item) => `${item.name} em ${item.percent}%`).join(", ")}. A ordem visual não foi medida.`
    : "Não há estrutura de página medida.";
  const contentPriority = noCta
    ? "Priorize as perguntas e a garantia medidas. Não priorize um CTA que não apareceu."
    : faqGroups > 0
      ? "Priorize as perguntas que mais se repetiram."
      : "Priorize os fatos do produto que realmente existem.";

  const analysisConfidence = analysis?.confidence ?? 0;
  let confidence = analysis ? analysisConfidence : 0.25;
  if (factsThin) confidence *= 0.85;
  if (!analysis) confidence = Math.min(confidence, 0.35);
  if (winner.points <= 0) confidence = Math.min(confidence, 0.2);
  confidence = Math.round(confidence * 100) / 100;

  const notes = [
    `Confiança ${Math.round(confidence * 100)}%.`,
    analysis ? `A análise de mercado entrou com confiança ${Math.round(analysisConfidence * 100)}% e qualidade ${analysis.marketSummary.researchQuality}.` : "A decisão não teve MarketIntelligenceAnalysis.",
    factsThin ? "Os fatos do produto estão insuficientes, então a página não pode ampliar claims." : `Qualidade dos fatos: ${facts.importQuality}.`,
    prohibited.length > 0 ? `${prohibited.length} claims proibidos da análise entram na lista do que evitar.` : analysis ? "A análise não registrou claim proibido." : "Não houve análise para medir claims proibidos.",
    opened > 0 ? `A estrutura usa ${opened} páginas abertas como base.` : "Nenhuma página aberta entrou na estrutura.",
  ];

  const adDirection = [
    `O anúncio segue o ângulo: ${angleLead[approachId]}`,
    claimsToAvoid.length > 0 ? `Não usar: ${claimsToAvoid.join("; ")}.` : "Nenhum claim proibido foi medido.",
    "A URL final do anúncio é a presell desta campanha.",
  ].join(" ");

  return {
    recommendedApproach: APPROACH_LABEL[approachId],
    approachId,
    confidence,
    reasoning,
    targetAudience,
    awarenessStage,
    marketSophistication,
    copyAngle: angleLead[approachId],
    persuasionTriggers: triggers,
    emotionalDrivers: emotions,
    objectionsToAnswer: objections,
    claimsToAvoid,
    seoDirection,
    landingStructure: structure,
    contentPriority,
    adDirection,
    validationNotes: notes.join(" "),
    basedOn: { researchedAt: analysis?.marketSummary.researchedAt ?? null, factsFingerprint: factsFingerprint(facts) },
  };
}

export function formatStrategyDecisionPrompt(decision: StrategyDecision): string {
  return [
    `STRATEGY DECISION: approach ${decision.approachId} (${decision.recommendedApproach}). This is binding editorial direction, not a product fact.`,
    `Generate exactly one variant now using the section shell ${decisionShell(decision.approachId)}. Do not choose a different approach.`,
    `Angle: ${decision.copyAngle}`,
    `Audience: ${decision.targetAudience}`,
    `Awareness: ${decision.awarenessStage}. Sophistication: ${decision.marketSophistication}`,
    `Structure observed: ${decision.landingStructure}`,
    `Priority: ${decision.contentPriority}`,
    decision.objectionsToAnswer.length > 0 ? `Objections to answer only when a product fact supports the answer: ${decision.objectionsToAnswer.join(" | ")}` : "No measured objection to answer.",
    decision.claimsToAvoid.length > 0 ? `Never write these claims: ${decision.claimsToAvoid.join("; ")}.` : "No prohibited claim was measured.",
    "Do not turn market patterns, prices, audiences, or scientific mentions into product facts.",
  ].join("\n");
}
