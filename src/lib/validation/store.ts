import { getDb } from "@/lib/db";
import type {
  CrossPageAiReview,
  StructuralDiversityLevel,
  ValidationCandidate,
  ValidationProduct,
  ValidationRun,
  ValidationRunStatus,
  ValidationRunSummary,
  HumanReviewState,
} from "@/lib/validation/types";
import { HUMAN_REVIEW_STATES } from "@/lib/validation/types";

type RunRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  notes: string;
  productsJson: string;
  summaryJson: string | null;
  crossPageReviewJson: string | null;
  structuralDiversity: string | null;
  marketStrategyJson?: string | null;
};

type CandidateRow = {
  id: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  productKey: string;
  productName: string;
  approach: string;
  template: string;
  theme: string;
  heroVariant: string;
  stagesJson: string;
  fingerprintJson: string | null;
  conditionsJson: string;
  contentQaJson: string;
  sourceQaJson: string;
  assetQaJson: string;
  visualQaJson: string;
  aiReviewJson: string;
  performanceJson: string | null;
  failuresJson: string;
  humanReview: string;
  humanNotes: string;
  desktopScreenshot: string | null;
  mobileScreenshot: string | null;
  pageCompositionJson: string | null;
  designPlanJson: string | null;
  creativeJson: string | null;
  factsJson: string | null;
  campaignId: number | null;
  publicationStatus: string;
  strategyMetaJson?: string | null;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapRun(row: RunRow): ValidationRun {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status as ValidationRunStatus,
    notes: row.notes,
    products: parseJson<ValidationProduct[]>(row.productsJson, []),
    summary: parseJson(row.summaryJson, null),
    crossPageReview: parseJson(row.crossPageReviewJson, null),
    structuralDiversity: (row.structuralDiversity as StructuralDiversityLevel | "INSUFFICIENT_SAMPLE" | null) ?? null,
    marketResearch: parseJson(row.marketStrategyJson ?? null, { marketResearch: null, strategy: null }).marketResearch ?? null,
    strategy: parseJson(row.marketStrategyJson ?? null, { marketResearch: null, strategy: null }).strategy ?? null,
  };
}

function mapCandidate(row: CandidateRow): ValidationCandidate {
  const human = HUMAN_REVIEW_STATES.includes(row.humanReview as HumanReviewState)
    ? (row.humanReview as HumanReviewState)
    : "PENDING";
  return {
    id: row.id,
    runId: row.runId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    productKey: row.productKey,
    productName: row.productName,
    approach: row.approach as ValidationCandidate["approach"],
    template: row.template,
    theme: row.theme,
    heroVariant: row.heroVariant,
    stages: parseJson(row.stagesJson, []),
    fingerprint: parseJson(row.fingerprintJson, null),
    conditions: parseJson(row.conditionsJson, []),
    contentQa: parseJson(row.contentQaJson, emptyContentQa()),
    sourceQa: parseJson(row.sourceQaJson, emptySourceQa()),
    assetQa: parseJson(row.assetQaJson, emptyAssetQa()),
    visualQa: parseJson(row.visualQaJson, emptyVisualQa()),
    aiReview: parseJson(row.aiReviewJson, emptyAiReview()),
    performance: parseJson(row.performanceJson, null),
    failures: parseJson(row.failuresJson, []),
    humanReview: human,
    humanNotes: row.humanNotes || "",
    desktopScreenshot: row.desktopScreenshot,
    mobileScreenshot: row.mobileScreenshot,
    pageCompositionJson: row.pageCompositionJson,
    designPlanJson: row.designPlanJson,
    creativeJson: row.creativeJson,
    factsJson: row.factsJson,
    campaignId: row.campaignId,
    publicationStatus: "draft",
    strategyMeta: parseJson(row.strategyMetaJson ?? null, null),
  };
}

export function emptyContentQa(): ValidationCandidate["contentQa"] {
  return {
    groundingStatus: "UNAVAILABLE",
    policyGate: "UNAVAILABLE",
    finalGate: "UNAVAILABLE",
    warnings: [],
    blockingRules: [],
  };
}

export function emptySourceQa(): ValidationCandidate["sourceQa"] {
  return {
    importQuality: "UNAVAILABLE",
    productAssetStatus: "UNKNOWN",
    productFactCompleteness: "EMPTY",
    sourceProvenance: "UNKNOWN",
    conditions: [],
  };
}

export function emptyAssetQa(): ValidationCandidate["assetQa"] {
  return {
    packshotFound: false,
    packshotRole: null,
    packshotDimensions: null,
    packshotProvenance: "NOT_FOUND",
    packshotClassification: null,
    rejectedAssetCount: 0,
  };
}

export function emptyVisualQa(): ValidationCandidate["visualQa"] {
  return {
    status: "UNAVAILABLE",
    highCount: 0,
    warningCount: 0,
    actionCodes: [],
    overflowViewports: [],
  };
}

export function emptyAiReview(): ValidationCandidate["aiReview"] {
  return {
    state: "UNAVAILABLE",
    overall: "UNAVAILABLE",
    dimensions: [],
    usedDesktopScreenshot: false,
    usedMobileScreenshot: false,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function createValidationRun(notes = ""): ValidationRun {
  const now = new Date().toISOString();
  const id = newId("val");
  getDb()
    .prepare(
      `INSERT INTO validation_runs (id, createdAt, updatedAt, status, notes, productsJson, summaryJson, crossPageReviewJson, structuralDiversity)
       VALUES (@id, @createdAt, @updatedAt, 'READY', @notes, '[]', NULL, NULL, NULL)`,
    )
    .run({ id, createdAt: now, updatedAt: now, notes });
  return getValidationRun(id)!;
}

export function getValidationRun(id: string): ValidationRun | null {
  const row = getDb().prepare("SELECT * FROM validation_runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? mapRun(row) : null;
}

export function listValidationRuns(): ValidationRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM validation_runs ORDER BY createdAt DESC")
    .all() as RunRow[];
  return rows.map(mapRun);
}

export function updateValidationRun(
  id: string,
  patch: Partial<{
    status: ValidationRunStatus;
    notes: string;
    products: ValidationProduct[];
    summary: ValidationRunSummary | null;
    crossPageReview: CrossPageAiReview | null;
    structuralDiversity: StructuralDiversityLevel | "INSUFFICIENT_SAMPLE" | null;
    marketResearch: ValidationRun["marketResearch"];
    strategy: ValidationRun["strategy"];
  }>,
): ValidationRun | null {
  const existing = getValidationRun(id);
  if (!existing) return null;
  const next: ValidationRun = {
    ...existing,
    status: patch.status ?? existing.status,
    notes: patch.notes ?? existing.notes,
    products: patch.products ?? existing.products,
    summary: patch.summary === undefined ? existing.summary : patch.summary,
    crossPageReview: patch.crossPageReview === undefined ? existing.crossPageReview : patch.crossPageReview,
    structuralDiversity:
      patch.structuralDiversity === undefined ? existing.structuralDiversity : patch.structuralDiversity,
    marketResearch: patch.marketResearch === undefined ? existing.marketResearch : patch.marketResearch,
    strategy: patch.strategy === undefined ? existing.strategy : patch.strategy,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE validation_runs SET
        updatedAt = @updatedAt,
        status = @status,
        notes = @notes,
        productsJson = @productsJson,
        summaryJson = @summaryJson,
        crossPageReviewJson = @crossPageReviewJson,
        structuralDiversity = @structuralDiversity,
        marketStrategyJson = @marketStrategyJson
       WHERE id = @id`,
    )
    .run({
      id,
      updatedAt: next.updatedAt,
      status: next.status,
      notes: next.notes,
      productsJson: JSON.stringify(next.products),
      summaryJson: next.summary ? JSON.stringify(next.summary) : null,
      crossPageReviewJson: next.crossPageReview ? JSON.stringify(next.crossPageReview) : null,
      structuralDiversity: next.structuralDiversity,
      marketStrategyJson: JSON.stringify({
        marketResearch: next.marketResearch || null,
        strategy: next.strategy || null,
      }),
    });
  return getValidationRun(id);
}

export function insertValidationCandidate(
  input: Omit<ValidationCandidate, "id" | "createdAt" | "updatedAt" | "publicationStatus" | "humanReview" | "humanNotes"> & {
    humanReview?: HumanReviewState;
    humanNotes?: string;
  },
): ValidationCandidate {
  const now = new Date().toISOString();
  const id = newId("cand");
  getDb()
    .prepare(
      `INSERT INTO validation_candidates (
        id, runId, createdAt, updatedAt, productKey, productName, approach, template, theme, heroVariant,
        stagesJson, fingerprintJson, conditionsJson, contentQaJson, sourceQaJson, assetQaJson, visualQaJson,
        aiReviewJson, performanceJson, failuresJson, humanReview, humanNotes, desktopScreenshot, mobileScreenshot,
        pageCompositionJson, designPlanJson, creativeJson, factsJson, campaignId, publicationStatus, strategyMetaJson
      ) VALUES (
        @id, @runId, @createdAt, @updatedAt, @productKey, @productName, @approach, @template, @theme, @heroVariant,
        @stagesJson, @fingerprintJson, @conditionsJson, @contentQaJson, @sourceQaJson, @assetQaJson, @visualQaJson,
        @aiReviewJson, @performanceJson, @failuresJson, @humanReview, @humanNotes, @desktopScreenshot, @mobileScreenshot,
        @pageCompositionJson, @designPlanJson, @creativeJson, @factsJson, @campaignId, 'draft', @strategyMetaJson
      )`,
    )
    .run({
      id,
      runId: input.runId,
      createdAt: now,
      updatedAt: now,
      productKey: input.productKey,
      productName: input.productName,
      approach: input.approach,
      template: input.template,
      theme: input.theme,
      heroVariant: input.heroVariant,
      stagesJson: JSON.stringify(input.stages),
      fingerprintJson: input.fingerprint ? JSON.stringify(input.fingerprint) : null,
      conditionsJson: JSON.stringify(input.conditions),
      contentQaJson: JSON.stringify(input.contentQa),
      sourceQaJson: JSON.stringify(input.sourceQa),
      assetQaJson: JSON.stringify(input.assetQa),
      visualQaJson: JSON.stringify(input.visualQa),
      aiReviewJson: JSON.stringify(input.aiReview),
      performanceJson: input.performance ? JSON.stringify(input.performance) : null,
      failuresJson: JSON.stringify(input.failures),
      humanReview: input.humanReview ?? "PENDING",
      humanNotes: input.humanNotes ?? "",
      desktopScreenshot: input.desktopScreenshot,
      mobileScreenshot: input.mobileScreenshot,
      pageCompositionJson: input.pageCompositionJson,
      designPlanJson: input.designPlanJson,
      creativeJson: input.creativeJson,
      factsJson: input.factsJson,
      campaignId: input.campaignId,
      strategyMetaJson: input.strategyMeta ? JSON.stringify(input.strategyMeta) : null,
    });
  return getValidationCandidate(id)!;
}

export function getValidationCandidate(id: string): ValidationCandidate | null {
  const row = getDb()
    .prepare("SELECT * FROM validation_candidates WHERE id = ?")
    .get(id) as CandidateRow | undefined;
  return row ? mapCandidate(row) : null;
}

export function listValidationCandidates(runId: string): ValidationCandidate[] {
  const rows = getDb()
    .prepare("SELECT * FROM validation_candidates WHERE runId = ? ORDER BY createdAt ASC")
    .all(runId) as CandidateRow[];
  return rows.map(mapCandidate);
}

export function updateValidationCandidate(
  id: string,
  patch: Partial<Omit<ValidationCandidate, "id" | "runId" | "createdAt" | "publicationStatus">>,
): ValidationCandidate | null {
  const existing = getValidationCandidate(id);
  if (!existing) return null;
  const next: ValidationCandidate = {
    ...existing,
    ...patch,
    id: existing.id,
    runId: existing.runId,
    createdAt: existing.createdAt,
    publicationStatus: "draft",
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE validation_candidates SET
        updatedAt = @updatedAt,
        productKey = @productKey,
        productName = @productName,
        approach = @approach,
        template = @template,
        theme = @theme,
        heroVariant = @heroVariant,
        stagesJson = @stagesJson,
        fingerprintJson = @fingerprintJson,
        conditionsJson = @conditionsJson,
        contentQaJson = @contentQaJson,
        sourceQaJson = @sourceQaJson,
        assetQaJson = @assetQaJson,
        visualQaJson = @visualQaJson,
        aiReviewJson = @aiReviewJson,
        performanceJson = @performanceJson,
        failuresJson = @failuresJson,
        humanReview = @humanReview,
        humanNotes = @humanNotes,
        desktopScreenshot = @desktopScreenshot,
        mobileScreenshot = @mobileScreenshot,
        pageCompositionJson = @pageCompositionJson,
        designPlanJson = @designPlanJson,
        creativeJson = @creativeJson,
        factsJson = @factsJson,
        campaignId = @campaignId,
        publicationStatus = 'draft'
       WHERE id = @id`,
    )
    .run({
      id,
      updatedAt: next.updatedAt,
      productKey: next.productKey,
      productName: next.productName,
      approach: next.approach,
      template: next.template,
      theme: next.theme,
      heroVariant: next.heroVariant,
      stagesJson: JSON.stringify(next.stages),
      fingerprintJson: next.fingerprint ? JSON.stringify(next.fingerprint) : null,
      conditionsJson: JSON.stringify(next.conditions),
      contentQaJson: JSON.stringify(next.contentQa),
      sourceQaJson: JSON.stringify(next.sourceQa),
      assetQaJson: JSON.stringify(next.assetQa),
      visualQaJson: JSON.stringify(next.visualQa),
      aiReviewJson: JSON.stringify(next.aiReview),
      performanceJson: next.performance ? JSON.stringify(next.performance) : null,
      failuresJson: JSON.stringify(next.failures),
      humanReview: next.humanReview,
      humanNotes: next.humanNotes,
      desktopScreenshot: next.desktopScreenshot,
      mobileScreenshot: next.mobileScreenshot,
      pageCompositionJson: next.pageCompositionJson,
      designPlanJson: next.designPlanJson,
      creativeJson: next.creativeJson,
      factsJson: next.factsJson,
      campaignId: next.campaignId,
    });
  return getValidationCandidate(id);
}

export function setHumanReview(id: string, state: HumanReviewState, notes = ""): ValidationCandidate | null {
  return updateValidationCandidate(id, { humanReview: state, humanNotes: notes });
}

export function candidateCountForRun(runId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM validation_candidates WHERE runId = ?")
    .get(runId) as { n: number };
  return row.n;
}
