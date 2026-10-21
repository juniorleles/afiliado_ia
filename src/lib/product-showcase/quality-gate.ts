import type { TrafficPolicyStatus, GoogleAdsPolicyStatus } from "@/lib/affiliate-program";
import { validateGrounding } from "@/lib/ai/grounding-validator";
import type { ProductFacts } from "@/lib/product-facts";
import type { AdaptivePresentationPlan, CommercialLimitationCode } from "@/lib/product-showcase/adaptive-plan";
import type { EditorialDocument } from "@/lib/product-showcase/editorial";

/**
 * Read-only LP Quality Gate.
 * The score does not predict conversion, release compliance, or publish the page.
 */

export type CheckStatus = "PASS" | "FAIL" | "REVIEW";
export type GateStatus = "PASS" | "FAIL" | "REVIEW";
export type CommercialReadiness = "SUFFICIENT" | "LIMITED" | "INSUFFICIENT" | "REVIEW_REQUIRED";
export type HumanReviewStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type DimensionId = "design" | "copy" | "content" | "performance" | "conversion";

export type QualityCheck = {
  id: string;
  dimension: DimensionId;
  status: CheckStatus;
  points: number;
  maxPoints: number;
  reason: string;
  evidence: string;
};

export type QualityEvidenceRecord = {
  id: string;
  status: "RECORDED" | "EVIDENCE_MISSING";
  detail: string;
};

export type ViewportProbe = {
  width: 1440 | 768 | 390;
  overflow: boolean;
  file?: string;
};

export type DomProbe = {
  route: string;
  matchesSelectedTemplate: boolean;
  h1Count: number;
  adminChrome: boolean;
  technicalCopy: boolean;
  emptyMedia: boolean;
  demoAsset: boolean;
  hero: "image" | "editorial" | "";
  ingredientDepth: "names" | "noted" | "photos" | "";
  ctaCount: number;
  imagesWithoutAlt: number;
  navLabel: string | null;
  navLabels: string[];
  minControlHeight: number | null;
};

export type LighthouseSeoScope = "PUBLIC" | "INTERNAL_NOINDEX";

export type LighthouseProbe = {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  contrastFailed: boolean;
  source: string;
  /** PUBLIC only when the measured URL is indexable. Internal noindex routes are not public SEO. */
  seoScope?: LighthouseSeoScope;
};

export type QualityEvidence = {
  viewports: ViewportProbe[] | null;
  dom: DomProbe | null;
  lighthouse: LighthouseProbe | null;
  humanReview: HumanReviewStatus;
  humanReviewNote?: string;
};

export type LpQualityInput = {
  facts: ProductFacts | null;
  plan: AdaptivePresentationPlan;
  editorial: EditorialDocument;
  structuralGate: "PASS" | "FAIL" | null;
  policyGate: "PASS" | "FAIL" | null;
  presentationTemplate: string | null;
  ppc: { brandPpc?: TrafficPolicyStatus | null; genericSearchPpc?: TrafficPolicyStatus | null } | null;
  googleAdsPolicy?: GoogleAdsPolicyStatus | null;
  directCheckoutLinking?: "FORBIDDEN" | "ALLOWED" | "UNKNOWN" | null;
  productSalesUrl?: string | null;
  evidence: QualityEvidence;
};

export type DimensionScore = {
  id: DimensionId;
  label: string;
  points: number;
  maxPoints: number;
  status: CheckStatus;
  checks: QualityCheck[];
};

export type LpQualityReport = {
  /** Checklist total. Kept for existing readers. Same value as automatedScore. */
  score: number;
  /** Checklist total. This is not homologated visual quality. */
  automatedScore: number;
  /** Human visual review. PENDING is not an approval. */
  visualReviewStatus: HumanReviewStatus;
  /** Quality gate after the human review rule. PENDING stays REVIEW. */
  finalQualityStatus: GateStatus;
  maxScore: 100;
  provisionalTarget: 85;
  predictsConversion: false;
  publicationRelease: false;
  adsRelease: false;
  dimensions: DimensionScore[];
  technicalGate: GateStatus;
  qualityGate: GateStatus;
  complianceGate: GateStatus;
  commercialReadiness: CommercialReadiness;
  limitations: string[];
  problems: string[];
  evidence: QualityEvidenceRecord[];
  humanReview: HumanReviewStatus;
  selectedTemplate: string | null;
};

const DIMENSIONS: Array<{ id: DimensionId; label: string; maxPoints: number }> = [
  { id: "design", label: "Design e UX", maxPoints: 25 },
  { id: "copy", label: "Copywriting e clareza comercial", maxPoints: 25 },
  { id: "content", label: "Conteúdo específico e credibilidade", maxPoints: 20 },
  { id: "performance", label: "Performance e acessibilidade", maxPoints: 15 },
  { id: "conversion", label: "Jornada de conversão", maxPoints: 15 },
];

const FILLER = /carefully crafted|unlock your|transform your|scientifically proven|premium formula/i;
const PROOF = /\b(testimonial|clinical study|clinically proven|doctor recommended|certified seal|star rating)\b/i;
const VIEWPORTS = [1440, 768, 390] as const;
const SOURCE_ORIGIN = "Declared by the product source";

function check(input: Omit<QualityCheck, "points"> & { award: boolean }): QualityCheck {
  const pass = input.status === "PASS" && input.award;
  return {
    id: input.id,
    dimension: input.dimension,
    status: input.status,
    points: pass ? input.maxPoints : 0,
    maxPoints: input.maxPoints,
    reason: input.reason,
    evidence: input.evidence,
  };
}

function lineKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function factLines(editorial: EditorialDocument): string[] {
  const lines: string[] = [];
  for (const block of editorial.blocks) {
    for (const trace of block.trace) {
      if (trace.field === "affiliateDisclosure" || trace.field === "healthDisclaimer" || trace.field === "productName") continue;
      if (/^\d+ ingredients$/.test(trace.text.trim())) continue;
      if (trace.text.trim() === SOURCE_ORIGIN) continue;
      lines.push(trace.text.trim());
    }
  }
  return lines.filter(Boolean);
}

function displayLines(editorial: EditorialDocument): string[] {
  return editorial.blocks.flatMap((block) => [...block.paragraphs, ...block.items, block.heading]).map((line) => line.trim()).filter(Boolean);
}

function shownOnce(editorial: EditorialDocument, text: string | null | undefined): number {
  if (!text?.trim()) return 0;
  const key = lineKey(text);
  return displayLines(editorial).filter((line) => lineKey(line) === key).length;
}

function featuresShown(editorial: EditorialDocument, features: string[]): boolean {
  const visible = displayLines(editorial).map(lineKey);
  return features.every((feature) => visible.includes(lineKey(feature)));
}

function viewportSet(evidence: QualityEvidence): ViewportProbe[] | null {
  if (!evidence.viewports || evidence.viewports.length === 0) return null;
  const found = VIEWPORTS.map((width) => evidence.viewports?.find((item) => item.width === width) ?? null);
  if (found.some((item) => !item)) return null;
  return found as ViewportProbe[];
}

function expectedNav(editorial: EditorialDocument): string[] {
  const labels: string[] = [];
  if (editorial.blocks.some((block) => block.id === "ingredients")) labels.push("Ingredients");
  if (editorial.blocks.some((block) => block.id === "format")) labels.push("Format");
  if (editorial.blocks.some((block) => block.id === "usage")) labels.push("Use");
  if (editorial.blocks.some((block) => block.id === "guarantee")) labels.push("Guarantee");
  return labels;
}

export function evaluateLpQuality(input: LpQualityInput): LpQualityReport {
  const { plan, editorial, evidence } = input;
  const dom = evidence.dom;
  const viewports = viewportSet(evidence);
  const checks: QualityCheck[] = [];
  const evidenceLog: QualityEvidenceRecord[] = [];
  const hard = new Set<DimensionId>();

  evidenceLog.push(viewports
    ? { id: "playwright-viewports", status: "RECORDED", detail: viewports.map((item) => `${item.width}:${item.file ?? "measured"}`).join(", ") }
    : { id: "playwright-viewports", status: "EVIDENCE_MISSING", detail: "Capturas 1440, 768 e 390 ausentes." });
  evidenceLog.push(dom
    ? { id: "playwright-dom", status: "RECORDED", detail: dom.route }
    : { id: "playwright-dom", status: "EVIDENCE_MISSING", detail: "Checklist de DOM ausente." });
  evidenceLog.push(evidence.lighthouse
    ? { id: "lighthouse", status: "RECORDED", detail: lighthouseEvidenceDetail(evidence.lighthouse) }
    : { id: "lighthouse", status: "EVIDENCE_MISSING", detail: "LIGHTHOUSE_NOT_RUN" });
  evidenceLog.push({ id: "human-visual-review", status: evidence.humanReview === "PENDING" ? "EVIDENCE_MISSING" : "RECORDED", detail: evidence.humanReview });

  const heroOk = Boolean(dom) && dom!.hero === plan.hero && dom!.h1Count === 1 && dom!.matchesSelectedTemplate;
  checks.push(check({
    id: "hero-hierarchy",
    dimension: "design",
    status: !dom ? "REVIEW" : heroOk ? "PASS" : "FAIL",
    award: heroOk,
    maxPoints: 6,
    reason: !dom ? "Sem DOM do hero." : heroOk ? "Hero corresponde ao plano e tem um h1." : "Hero, h1 ou rota não correspondem ao template selecionado.",
    evidence: dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const emptyOk = Boolean(dom) && !dom!.emptyMedia && !(plan.hero === "editorial" && dom!.hero === "image");
  checks.push(check({
    id: "empty-media",
    dimension: "design",
    status: !dom ? "REVIEW" : emptyOk ? "PASS" : "FAIL",
    award: emptyOk,
    maxPoints: 5,
    reason: !dom ? "Sem evidência de mídia." : emptyOk ? "Nenhum espaço vazio de imagem." : "Há um espaço de mídia vazio.",
    evidence: dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const copyOk = Boolean(dom) && !dom!.technicalCopy && !dom!.adminChrome;
  checks.push(check({
    id: "technical-copy",
    dimension: "design",
    status: !dom ? "REVIEW" : copyOk ? "PASS" : "FAIL",
    award: copyOk,
    maxPoints: 4,
    reason: !dom ? "Sem texto renderizado." : copyOk ? "Sem aviso técnico de imagem e sem chrome de admin." : "A página mostra chrome técnico ou aviso de imagem.",
    evidence: dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const overflowOk = Boolean(viewports) && viewports!.every((item) => !item.overflow);
  checks.push(check({
    id: "overflow",
    dimension: "design",
    status: !viewports ? "REVIEW" : overflowOk ? "PASS" : "FAIL",
    award: overflowOk,
    maxPoints: 6,
    reason: !viewports ? "Faltam as três larguras." : overflowOk ? "Sem overflow em 1440, 768 e 390." : "Há overflow horizontal.",
    evidence: viewports ? "playwright-viewports" : "EVIDENCE_MISSING",
  }));

  const ingredientOk = plan.ingredientCount === 0
    ? true
    : Boolean(dom) && (plan.ingredientPhotos ? dom!.ingredientDepth === "photos" : dom!.ingredientDepth === "names" || dom!.ingredientDepth === "noted");
  checks.push(check({
    id: "ingredient-treatment",
    dimension: "design",
    status: plan.ingredientCount === 0 ? "PASS" : !dom ? "REVIEW" : ingredientOk ? "PASS" : "FAIL",
    award: ingredientOk,
    maxPoints: 4,
    reason: plan.ingredientCount === 0 ? "Sem ingredientes elegíveis; a seção fica de fora." : !dom ? "Sem evidência da lista de ingredientes." : ingredientOk ? "A apresentação segue a profundidade dos ingredientes." : "A lista não segue o plano.",
    evidence: plan.ingredientCount === 0 ? "editorial" : dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const visible = displayLines(editorial).map(lineKey);
  const repeated = visible.filter((line, index) => visible.indexOf(line) !== index);
  const filler = displayLines(editorial).some((line) => FILLER.test(line));
  checks.push(check({
    id: "no-repetition",
    dimension: "copy",
    status: filler || repeated.length > 0 ? "FAIL" : "PASS",
    award: !filler && repeated.length === 0,
    maxPoints: 8,
    reason: filler ? "Há texto genérico sem fato." : repeated.length > 0 ? "Uma linha elegível aparece mais de uma vez." : "Nenhuma linha se repete.",
    evidence: "editorial",
  }));
  if (filler) hard.add("copy");

  checks.push(commercialCheck("price", plan.price?.statement ?? null, plan.price ? [] : plan.limitations, editorial, 6));
  checks.push(commercialCheck("format", plan.format === "unknown" ? null : plan.formatStatement, plan.format === "unknown" ? ["FORMAT_NOT_CLASSIFIED"] : [], editorial, 4));
  checks.push(usageCheck(plan, editorial));
  checks.push(commercialCheck("guarantee", plan.guarantee, plan.guarantee ? [] : plan.limitations, editorial, 3));

  const lines = factLines(editorial);
  const ungrounded = input.facts ? lines.filter((line) => validateGrounding(line, input.facts!, { productIdentity: input.facts!.productName }).status !== "GROUNDED") : lines;
  const groundingKnown = Boolean(input.facts);
  checks.push(check({
    id: "grounding",
    dimension: "content",
    status: !groundingKnown ? "REVIEW" : ungrounded.length > 0 ? "FAIL" : "PASS",
    award: groundingKnown && ungrounded.length === 0,
    maxPoints: 12,
    reason: !groundingKnown ? "Product Facts ausentes; grounding não foi executado." : ungrounded.length > 0 ? `Linha sem GROUNDED: ${ungrounded[0]}` : "Cada linha de fato está GROUNDED.",
    evidence: groundingKnown ? "grounding" : "EVIDENCE_MISSING",
  }));
  if (ungrounded.length > 0) hard.add("content");

  const proof = displayLines(editorial).filter((line) => PROOF.test(line) && !JSON.stringify(input.facts ?? {}).toLowerCase().includes(line.toLowerCase()));
  checks.push(check({
    id: "no-invented-proof",
    dimension: "content",
    status: proof.length > 0 ? "FAIL" : "PASS",
    award: proof.length === 0,
    maxPoints: 4,
    reason: proof.length > 0 ? "Há prova, depoimento ou selo sem fato." : "Sem prova inventada.",
    evidence: "editorial",
  }));
  if (proof.length > 0) hard.add("content");

  const ingredientItems = editorial.blocks.find((block) => block.id === "ingredients")?.items.length ?? 0;
  const countOk = ingredientItems === plan.ingredientCount;
  checks.push(check({
    id: "ingredient-count",
    dimension: "content",
    status: countOk ? "PASS" : "FAIL",
    award: countOk,
    maxPoints: 4,
    reason: countOk ? "A contagem de ingredientes segue os fatos." : "A contagem não segue os fatos.",
    evidence: "editorial",
  }));

  checks.push(check({
    id: "viewport-overflow",
    dimension: "performance",
    status: !viewports ? "REVIEW" : overflowOk ? "PASS" : "FAIL",
    award: overflowOk,
    maxPoints: 6,
    reason: !viewports ? "Sem medição de overflow." : overflowOk ? "As três larguras não estouram." : "Overflow medido.",
    evidence: viewports ? "playwright-viewports" : "EVIDENCE_MISSING",
  }));

  const needsAlt = plan.hero === "image" || plan.ingredientPhotos;
  const altOk = !needsAlt || (Boolean(dom) && dom!.imagesWithoutAlt === 0);
  checks.push(check({
    id: "alt-text",
    dimension: "performance",
    status: !needsAlt ? "PASS" : !dom ? "REVIEW" : altOk ? "PASS" : "FAIL",
    award: altOk,
    maxPoints: 3,
    reason: !needsAlt ? "Não há imagem que exija alt." : !dom ? "Sem DOM para conferir alt." : altOk ? "Imagens têm alt." : "Há imagem sem alt.",
    evidence: !needsAlt ? "adaptive-plan" : dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const navOk = Boolean(dom?.navLabel?.trim());
  checks.push(check({
    id: "named-nav",
    dimension: "performance",
    status: !dom ? "REVIEW" : navOk ? "PASS" : "FAIL",
    award: navOk,
    maxPoints: 3,
    reason: !dom ? "Sem DOM da navegação." : navOk ? "A navegação tem nome acessível." : "A navegação não tem nome.",
    evidence: dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const tapKnown = dom?.minControlHeight != null;
  const tapOk = tapKnown && dom!.minControlHeight! >= 44;
  checks.push(check({
    id: "tap-targets",
    dimension: "performance",
    status: !tapKnown ? "REVIEW" : tapOk ? "PASS" : "FAIL",
    award: tapOk,
    maxPoints: 3,
    reason: !tapKnown ? "Altura dos controles não foi medida." : tapOk ? "Controles medidos têm pelo menos 44px." : `Controle medido com ${dom!.minControlHeight}px.`,
    evidence: tapKnown ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const ctaAuthorized = Boolean(plan.cta);
  const ctaMatches = ctaAuthorized ? editorial.cta?.href === plan.cta?.href && (dom ? dom.ctaCount === 1 : true) : editorial.cta === null && (dom ? dom.ctaCount === 0 : true);
  checks.push(check({
    id: "cta",
    dimension: "conversion",
    status: ctaMatches ? "PASS" : "FAIL",
    award: ctaMatches,
    maxPoints: 8,
    reason: ctaAuthorized
      ? ctaMatches ? "Há um CTA autorizado." : "O CTA autorizado não está único e válido."
      : ctaMatches ? "Sem CTA autorizado; nenhum botão foi criado." : "Um botão apareceu sem hop autorizado.",
    evidence: dom ? "playwright-dom" : "editorial",
  }));
  if (!ctaMatches && !ctaAuthorized) hard.add("conversion");

  const expected = expectedNav(editorial);
  const navMatch = Boolean(dom) && expected.every((label) => dom!.navLabels.some((item) => lineKey(item) === lineKey(label)));
  checks.push(check({
    id: "nav-sections",
    dimension: "conversion",
    status: !dom ? "REVIEW" : navMatch ? "PASS" : "FAIL",
    award: navMatch,
    maxPoints: 4,
    reason: !dom ? "Sem lista de navegação renderizada." : navMatch ? "A navegação acompanha as seções existentes." : "A navegação não acompanha as seções.",
    evidence: dom ? "playwright-dom" : "EVIDENCE_MISSING",
  }));

  const disclosure = editorial.blocks.find((block) => block.id === "disclosure");
  const disclosureOk = Boolean(disclosure?.paragraphs[0]?.trim());
  checks.push(check({
    id: "disclosure",
    dimension: "conversion",
    status: disclosureOk ? "PASS" : "FAIL",
    award: disclosureOk,
    maxPoints: 3,
    reason: disclosureOk ? "O disclosure está no documento editorial." : "O disclosure não está no documento.",
    evidence: "editorial",
  }));

  if (plan.benefits === "required" && !featuresShown(editorial, plan.features)) hard.add("copy");
  if (dom?.demoAsset && input.presentationTemplate) hard.add("design");

  const dimensions = DIMENSIONS.map((dimension) => {
    const own = checks.filter((item) => item.dimension === dimension.id);
    const failed = hard.has(dimension.id);
    const points = failed ? 0 : own.reduce((sum, item) => sum + item.points, 0);
    const status: CheckStatus = failed ? "FAIL" : own.some((item) => item.status === "REVIEW") ? "REVIEW" : own.some((item) => item.status === "FAIL") ? "FAIL" : "PASS";
    return { ...dimension, points, status, checks: own };
  });

  const score = dimensions.reduce((sum, dimension) => sum + dimension.points, 0);
  const limitations = readinessLimitations(input);
  const readiness = commercialReadiness(input, limitations);
  const technicalGate = technicalStatus(input, checks, dom, viewports);
  const complianceGate = complianceStatus(input, ungrounded, groundingKnown, Boolean(dom?.demoAsset));
  const qualityGate: GateStatus = evidence.humanReview !== "ACCEPTED" || score < 85 || hard.size > 0 || dimensions.some((dimension) => dimension.status !== "PASS")
    ? "REVIEW"
    : "PASS";

  const problems = [
    ...checks.filter((item) => item.status !== "PASS").map((item) => `${item.id}: ${item.reason}`),
    ...limitations,
  ];

  return {
    score,
    automatedScore: score,
    visualReviewStatus: evidence.humanReview,
    finalQualityStatus: qualityGate,
    maxScore: 100,
    provisionalTarget: 85,
    predictsConversion: false,
    publicationRelease: false,
    adsRelease: false,
    dimensions,
    technicalGate,
    qualityGate,
    complianceGate,
    commercialReadiness: readiness,
    limitations,
    problems,
    evidence: evidenceLog,
    humanReview: evidence.humanReview,
    selectedTemplate: input.presentationTemplate,
  };
}

function lighthouseEvidenceDetail(probe: LighthouseProbe): string {
  const scope = probe.seoScope === "PUBLIC" ? "SEO_PUBLIC" : "SEO_NOT_PUBLIC";
  return `${probe.source} | performance ${probe.performance} | accessibility ${probe.accessibility} | best-practices ${probe.bestPractices} | seo ${probe.seo} | ${scope}`;
}

export function lighthouseProbeFromReport(
  parsed: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { score?: number | null }>;
  },
  source: string,
): LighthouseProbe | null {
  const score = (id: string) => parsed.categories?.[id]?.score;
  const performance = score("performance");
  const accessibility = score("accessibility");
  const bestPractices = score("best-practices");
  const seo = score("seo");
  if ([performance, accessibility, bestPractices, seo].some((item) => typeof item !== "number")) return null;
  const crawlable = parsed.audits?.["is-crawlable"]?.score;
  return {
    performance: performance as number,
    accessibility: accessibility as number,
    bestPractices: bestPractices as number,
    seo: seo as number,
    contrastFailed: parsed.audits?.["color-contrast"]?.score === 0,
    source,
    seoScope: crawlable === 1 ? "PUBLIC" : "INTERNAL_NOINDEX",
  };
}

function usageCheck(plan: AdaptivePresentationPlan, editorial: EditorialDocument): QualityCheck {
  if (plan.usage.length === 0) {
    const ok = plan.limitations.includes("NO_ELIGIBLE_USAGE") || Boolean(plan.formatStatement);
    return check({
      id: "usage",
      dimension: "copy",
      status: ok ? "PASS" : "FAIL",
      award: ok,
      maxPoints: 4,
      reason: ok ? "Não há uso elegível além do que já foi classificado." : "O uso ausente não tem limitação.",
      evidence: "editorial",
    });
  }
  const missing = plan.usage.filter((line) => shownOnce(editorial, line) !== 1);
  const ok = missing.length === 0;
  return check({
    id: "usage",
    dimension: "copy",
    status: ok ? "PASS" : "FAIL",
    award: ok,
    maxPoints: 4,
    reason: ok ? "O uso elegível aparece uma vez." : "Uma linha de uso elegível não aparece uma vez.",
    evidence: "editorial",
  });
}

function commercialCheck(
  id: string,
  statement: string | null,
  limitations: readonly string[],
  editorial: EditorialDocument,
  maxPoints: number,
): QualityCheck {
  const count = shownOnce(editorial, statement);
  const relevant = id === "price"
    ? ["NO_VERIFIED_PRICE", "PRICE_CONTEXT_INSUFFICIENT"]
    : id === "guarantee"
      ? ["NO_ELIGIBLE_GUARANTEE"]
      : limitations;
  const omitted = !statement && (id === "format" || relevant.some((code) => limitations.includes(code)));
  const ok = statement ? count === 1 : omitted;
  const dropped = Boolean(statement) && count === 0;
  return check({
    id,
    dimension: "copy",
    status: ok ? "PASS" : "FAIL",
    award: ok,
    maxPoints,
    reason: statement
      ? count === 1 ? "O fato aparece uma vez." : dropped ? "O fato elegível não aparece e não há limitação." : "O fato aparece mais de uma vez."
      : ok ? "O fato ausente está registrado como limitação." : "O fato ausente não tem limitação.",
    evidence: "editorial",
  });
}

function readinessLimitations(input: LpQualityInput): string[] {
  const codes = new Set<string>(input.plan.limitations);
  const specific = input.plan.ingredientCount > 0 || Boolean(input.plan.formatStatement) || input.plan.usage.length > 0 || input.plan.features.length > 0;
  if (!specific && !input.plan.price && !input.plan.guarantee) codes.add("INSUFFICIENT_PRODUCT_INFORMATION");
  if (input.evidence.humanReview !== "ACCEPTED") codes.add("VISUAL_REVIEW_PENDING");
  if (input.ppc?.brandPpc === "BLOCKED" || input.ppc?.genericSearchPpc === "BLOCKED") codes.add("PPC_PROHIBITED");
  if (input.ppc?.brandPpc === "UNKNOWN" || input.ppc?.genericSearchPpc === "UNKNOWN") codes.add("PPC_PERMISSION_UNKNOWN");
  return [...codes];
}

function commercialReadiness(input: LpQualityInput, limitations: string[]): CommercialReadiness {
  if (limitations.includes("INSUFFICIENT_PRODUCT_INFORMATION")) return "INSUFFICIENT";
  const channelAllowed = input.ppc?.brandPpc === "ALLOWED" && input.ppc.genericSearchPpc === "ALLOWED";
  const adsClosed = input.googleAdsPolicy === "BLOCKED" || input.googleAdsPolicy === "REVIEW_REQUIRED" || input.googleAdsPolicy === "UNKNOWN";
  if (input.evidence.humanReview !== "ACCEPTED" || !channelAllowed || adsClosed || !input.ppc) return "REVIEW_REQUIRED";
  if (limitations.includes("PRICE_CONTEXT_INSUFFICIENT") || limitations.includes("NO_AUTHORIZED_AFFILIATE_URL") || limitations.includes("NO_VERIFIED_PRICE") || limitations.includes("NO_ELIGIBLE_GUARANTEE")) {
    return "LIMITED";
  }
  return "SUFFICIENT";
}

function technicalStatus(
  input: LpQualityInput,
  checks: QualityCheck[],
  dom: DomProbe | null,
  viewports: ViewportProbe[] | null,
): GateStatus {
  const benefitsMissing = input.plan.benefits === "required" && !featuresShown(input.editorial, input.plan.features);
  const heroMissing = !input.editorial.blocks.some((block) => block.id === "introduction");
  const footerMissing = !input.editorial.blocks.some((block) => block.id === "disclosure");
  const hardFail = input.structuralGate === "FAIL"
    || benefitsMissing
    || heroMissing
    || footerMissing
    || Boolean(viewports?.some((item) => item.overflow))
    || Boolean(dom?.adminChrome)
    || Boolean(dom?.emptyMedia)
    || Boolean(dom && dom.imagesWithoutAlt > 0 && (input.plan.hero === "image" || input.plan.ingredientPhotos));
  if (hardFail) return "FAIL";
  const technicalIds = new Set(["hero-hierarchy", "empty-media", "technical-copy", "overflow", "viewport-overflow", "alt-text", "named-nav", "tap-targets"]);
  if (!dom || !viewports || checks.some((item) => technicalIds.has(item.id) && item.status !== "PASS")) return "REVIEW";
  if (dom && !dom.matchesSelectedTemplate) return "REVIEW";
  return "PASS";
}

function complianceStatus(input: LpQualityInput, ungrounded: string[], groundingKnown: boolean, demoAsset: boolean): GateStatus {
  const directCheckout = input.directCheckoutLinking === "FORBIDDEN"
    && Boolean(input.plan.cta?.href)
    && Boolean(input.productSalesUrl)
    && input.plan.cta!.href === input.productSalesUrl;
  if (!groundingKnown || input.policyGate === null) return "REVIEW";
  if (ungrounded.length > 0 || input.policyGate === "FAIL" || demoAsset || directCheckout) return "FAIL";
  const ppcBlocked = input.ppc?.brandPpc === "BLOCKED" || input.ppc?.genericSearchPpc === "BLOCKED";
  const ppcAllowed = input.ppc?.brandPpc === "ALLOWED" && input.ppc.genericSearchPpc === "ALLOWED";
  const adsBlocked = input.googleAdsPolicy === "BLOCKED" || input.googleAdsPolicy === "REVIEW_REQUIRED";
  if (ppcBlocked || !ppcAllowed || adsBlocked || input.googleAdsPolicy === "UNKNOWN" || input.directCheckoutLinking === "UNKNOWN" || input.directCheckoutLinking == null) return "REVIEW";
  return "PASS";
}

export type { CommercialLimitationCode };
