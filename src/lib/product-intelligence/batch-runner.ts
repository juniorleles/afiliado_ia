/**
 * Host record domain: product batch runner.
 *
 * Walks each ClickBank product through the existing product analysis pipeline
 * and then through the recommendation engine. One product failure is recorded
 * and the remaining products still run. It never changes those engines, never
 * approves a product, and never publishes a campaign. This method never throws.
 */
import { BATCH_SOURCES, type BatchSource } from "./batch-context";
import {
  createBatchSnapshot,
  createBatchStatistics,
  freezeDeepBatch,
  type BatchAnalysis,
  type BatchIssue,
  type BatchMetadata,
  type BatchProductResult,
  type BatchRankedProduct,
  type BatchResult,
} from "./batch-snapshot";
import { createBatchValidator, type BatchValidator } from "./batch-validator";
import { createProductAnalysisPipeline } from "./product-analysis-pipeline";
import { createProductRecommendationEngine } from "./product-recommendation-engine";

export type BatchClock = () => number;
export type BatchTimestamp = () => string;
export type BatchIdFactory = () => string;

export interface BatchRunnerOptions {
  now?: BatchClock;
  timestamp?: BatchTimestamp;
  idFactory?: BatchIdFactory;
}

export interface BatchRunner {
  readonly validator: BatchValidator;
  run(input: unknown): Promise<BatchResult>;
}

const defaultClock: BatchClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function issuesOf(value: unknown): BatchIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.field !== "string" || typeof item.message !== "string") return [];
    return [{ field: item.field, message: item.message }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

interface WorkItem {
  source: BatchSource;
  index: number;
  item: unknown;
}

function workItems(input: Record<string, unknown>): WorkItem[] {
  const items: WorkItem[] = [];
  for (const source of BATCH_SOURCES) {
    const list = input[source];
    if (!Array.isArray(list)) continue;
    list.forEach((item, index) => items.push({ source, index, item }));
  }
  return items;
}

function pipelineInput(item: unknown, metadata: { executionMetadata: BatchMetadata; runtimeMetadata: BatchMetadata; configuration: BatchMetadata }): Record<string, unknown> | null {
  if (typeof item === "string") {
    return {
      marketplaceUrl: item,
      marketplaceProductId: "",
      rawHtml: "",
      landingHtml: "",
      searchContext: "",
      ...metadata,
    };
  }
  if (!isRecord(item)) return null;
  const text = (key: string) => (typeof item[key] === "string" ? item[key] : "");
  return {
    marketplaceUrl: text("marketplaceUrl"),
    marketplaceProductId: text("marketplaceProductId"),
    rawHtml: text("rawHtml"),
    landingHtml: text("landingHtml"),
    searchContext: text("searchContext"),
    ...metadata,
  };
}

function failedProduct(item: WorkItem, issues: BatchIssue[]): BatchProductResult {
  return {
    source: item.source,
    index: item.index,
    status: "REJECTED",
    issues,
    productName: null,
    candidateId: null,
    ranked: false,
    report: null,
    evidenceGraph: null,
    discovery: null,
    opportunityAnalysis: null,
    trafficAnalysis: null,
    decisionAnalysis: null,
  };
}

export function createBatchRunner(options: BatchRunnerOptions = {}): BatchRunner {
  const validator = createBatchValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `batch-${++serial}`);

  return {
    validator,
    async run(input) {
      const started = now();
      const blank: BatchMetadata = {};
      const refused = (issues: BatchIssue[], metadata: BatchMetadata = blank): BatchResult => ({
        status: "REJECTED",
        issues,
        analysis: null,
        statistics: createBatchStatistics({ productCount: 0, succeededCount: 0, failedCount: 0, rankedCount: 0, executionTime: Math.max(0, now() - started) }),
        snapshot: null,
        metadata,
        executionTime: Math.max(0, now() - started),
      });

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const source = input;
        const metadata = isRecord(source.executionMetadata) ? { ...(source.executionMetadata as BatchMetadata) } : {};
        const runtimeMetadata = isRecord(source.runtimeMetadata) ? { ...(source.runtimeMetadata as BatchMetadata) } : {};
        const configuration = isRecord(source.configuration) ? { ...(source.configuration as BatchMetadata) } : {};
        const bundle = { executionMetadata: metadata, runtimeMetadata, configuration };
        const clocks = { now, timestamp };
        const products: BatchProductResult[] = [];
        const recommendationInputs: Record<string, unknown>[] = [];
        const seenCandidates = new Set<string>();

        for (const work of workItems(source)) {
          try {
            const next = pipelineInput(work.item, bundle);
            if (next === null) {
              products.push(freezeDeepBatch(failedProduct(work, [{ field: work.source, message: "Invalid Metadata: a product record or a product URL is required." }])));
              continue;
            }
            const pipeline = createProductAnalysisPipeline(clocks);
            const result = await pipeline.run(next);
            if (result.status !== "OK" || result.analysis === null) {
              products.push(freezeDeepBatch(failedProduct(work, issuesOf(result.issues))));
              continue;
            }
            const analysis = result.analysis;
            const discovery = asRecord(analysis.discovery);
            const candidateId = textOf(discovery?.id) ?? textOf(discovery?.candidateId);
            const productName = textOf(asRecord(analysis.productFacts)?.productName);
            if (candidateId === null) {
              products.push(freezeDeepBatch(failedProduct(work, [{ field: "discovery", message: "Invalid Report: discovery analysis needs an id." }])));
              continue;
            }
            if (seenCandidates.has(candidateId)) {
              products.push(
                freezeDeepBatch({
                  ...failedProduct(work, [{ field: "ranking", message: `Corrupted Ranking: candidate "${candidateId}" is repeated.` }]),
                  productName,
                  candidateId,
                  report: asRecord(analysis.report),
                  evidenceGraph: asRecord(analysis.evidenceGraph),
                  discovery,
                  opportunityAnalysis: asRecord(analysis.opportunityAnalysis),
                  trafficAnalysis: asRecord(analysis.trafficAnalysis),
                  decisionAnalysis: asRecord(analysis.decisionAnalysis),
                }),
              );
              continue;
            }
            seenCandidates.add(candidateId);
            recommendationInputs.push({
              productIntelligenceReport: analysis.report,
              evidenceGraph: analysis.evidenceGraph,
              discoveryAnalysis: analysis.discovery,
              opportunityAnalysis: analysis.opportunityAnalysis,
              trafficAnalysis: analysis.trafficAnalysis,
              decisionAnalysis: analysis.decisionAnalysis,
            });
            products.push(
              freezeDeepBatch({
                source: work.source,
                index: work.index,
                status: "OK",
                issues: [],
                productName,
                candidateId,
                ranked: true,
                report: asRecord(analysis.report),
                evidenceGraph: asRecord(analysis.evidenceGraph),
                discovery,
                opportunityAnalysis: asRecord(analysis.opportunityAnalysis),
                trafficAnalysis: asRecord(analysis.trafficAnalysis),
                decisionAnalysis: asRecord(analysis.decisionAnalysis),
              }),
            );
          } catch (error) {
            products.push(freezeDeepBatch(failedProduct(work, [{ field: work.source, message: error instanceof Error ? error.message : "The product walk stopped." }])));
          }
        }

        let recommendations: Record<string, unknown> | null = null;
        let rankedProducts: BatchRankedProduct[] = [];
        const batchIssues: BatchIssue[] = [];
        if (recommendationInputs.length > 0) {
          const recommended = createProductRecommendationEngine({ ...clocks, idFactory: () => "recommendation-1" }).recommend({
            products: recommendationInputs,
            ...bundle,
          });
          if (recommended.status !== "OK" || recommended.recommendation === null) {
            batchIssues.push(...issuesOf(recommended.issues));
            for (const product of products) {
              if (product.ranked) {
                const failed = freezeDeepBatch({ ...product, ranked: false });
                const at = products.indexOf(product);
                if (at >= 0) products[at] = failed;
              }
            }
          } else {
            recommendations = recommended.recommendation as unknown as Record<string, unknown>;
            const entries = Array.isArray(recommended.recommendation.recommendations) ? recommended.recommendation.recommendations : [];
            rankedProducts = entries.flatMap((entry) => {
              if (!isRecord(entry) || typeof entry.candidateId !== "string" || typeof entry.productName !== "string") return [];
              return [
                {
                  candidateId: entry.candidateId,
                  productName: entry.productName,
                  rankingPosition: typeof entry.rankingPosition === "number" ? entry.rankingPosition : 0,
                  level: typeof entry.level === "string" ? entry.level : "",
                  confidence: typeof entry.confidence === "number" ? entry.confidence : 0,
                },
              ];
            });
          }
        }

        const succeededCount = products.filter((product) => product.status === "OK").length;
        const analysis = freezeDeepBatch({
          products,
          recommendations,
          rankedProducts,
        } as BatchAnalysis);
        const executionTime = Math.max(0, now() - started);
        const statistics = createBatchStatistics({
          productCount: products.length,
          succeededCount,
          failedCount: products.length - succeededCount,
          rankedCount: rankedProducts.length,
          executionTime,
        });
        const snapshot = createBatchSnapshot({
          batchId: idFactory(),
          productCount: products.length,
          rankedCount: rankedProducts.length,
          createdAt: timestamp(),
          metadata: { ...metadata, productCount: products.length, rankedCount: rankedProducts.length },
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        return freezeDeepBatch({
          status: "OK",
          issues: batchIssues,
          analysis,
          statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "batch", message: error instanceof Error ? error.message : "The batch stopped." }]);
      }
    },
  };
}
