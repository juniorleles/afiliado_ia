/**
 * Host record domain: product analysis runner.
 *
 * Walks one ClickBank product through the existing engines, once each, and
 * returns a frozen analysis. It never publishes a campaign, never signs in,
 * and never reaches an outside system. A refused stage stops the walk and
 * returns REJECTED. This method never throws.
 */
import { createClickBankImporter } from "./clickbank-importer";
import { createCommercialIntelligence } from "./commercial-intelligence";
import { createCompetitionIntelligence } from "./competition-intelligence";
import { createGoogleSearchIntelligence } from "./google-search-intelligence";
import { createLandingPageIntelligence } from "./landing-page-intelligence";
import { createProductAnalysisRecorder } from "./product-analysis-recorder";
import {
  PRODUCT_ANALYSIS_WORKFLOW_ID,
  copyPlainProductAnalysis,
  createProductAnalysisSnapshot,
  freezeDeepProductAnalysis,
  type ProductAnalysis,
  type ProductAnalysisIssue,
  type ProductAnalysisMetadata,
  type ProductAnalysisResult,
  type ProductAnalysisStage,
} from "./product-analysis-snapshot";
import { createProductAnalysisValidator, type ProductAnalysisValidator } from "./product-analysis-validator";
import { createProductIntelligenceReport } from "./product-intelligence-report";
import { createProductOpportunityAdapter } from "./product-opportunity-adapter";
import { createDecisionResolver } from "../decision/decision-resolver-host";
import { createExecutionPlanBuilder } from "../execution/execution-plan-builder";
import { createOpportunityResolver } from "../opportunity/opportunity-resolver";
import { createSignalPipeline } from "../opportunity/opportunity-signal-pipeline";
import type { OpportunitySignalModule } from "../opportunity/opportunity-signal-contract";
import { createGoogleAdsCampaignBuilder } from "../providers/google-ads/google-ads-campaign-builder";
import { createTrafficResolver } from "../traffic/traffic-resolver";
import { createTrafficSignalPipeline } from "../traffic/traffic-signal-pipeline";
import type { TrafficSignalModule } from "../traffic/traffic-signal-contract";
import { createWorkflowStateMachine } from "../workflow/workflow-state-machine-host";

export type ProductAnalysisClock = () => number;
export type ProductAnalysisTimestamp = () => string;
export type ProductAnalysisIdFactory = () => string;

export interface ProductAnalysisRunnerOptions {
  now?: ProductAnalysisClock;
  timestamp?: ProductAnalysisTimestamp;
  idFactory?: ProductAnalysisIdFactory;
}

export interface ProductAnalysisRunner {
  readonly validator: ProductAnalysisValidator;
  run(input: unknown): Promise<ProductAnalysisResult>;
}

const defaultClock: ProductAnalysisClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function issuesOf(value: unknown): ProductAnalysisIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.field !== "string" || typeof item.message !== "string") return [];
    return [{ field: item.field, message: item.message }];
  });
}

function observationSignal(): OpportunitySignalModule {
  return {
    id: "observed-evidence",
    name: "Observed evidence",
    version: "1.0.0",
    category: "EVIDENCE",
    enabled: true,
    priority: 0,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => true,
    validate: () => [],
    analyze: () => ({ status: "COMPLETED", confidence: null, metadata: {}, warnings: [], errors: [] }),
  };
}

function observationTrafficSignal(): TrafficSignalModule {
  return {
    id: "observed-traffic",
    name: "Observed traffic",
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: 0,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsAnalysis: () => true,
    validate: () => [],
    analyze: () => ({ status: "COMPLETED", confidence: null, metadata: {}, warnings: [], errors: [] }),
  };
}

function draftCampaign() {
  return {
    campaigns: [
      {
        id: "campaign-draft",
        name: "search",
        budgetId: "b-1",
        settingsId: "s-1",
        networkId: "net-1",
        locationIds: ["loc-1"],
        languageIds: ["lang-1"],
        scheduleId: "sch-1",
        bidStrategyId: "bs-1",
        metadata: {},
        warnings: [],
      },
    ],
    budgets: [{ id: "b-1", name: "daily", metadata: {} }],
    settings: [{ id: "s-1", campaignId: "campaign-draft", metadata: {} }],
    networks: [{ id: "net-1", name: "search", metadata: {} }],
    locations: [{ id: "loc-1", name: "US", metadata: {} }],
    languages: [{ id: "lang-1", name: "en", metadata: {} }],
    schedules: [{ id: "sch-1", name: "all-day", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
  };
}

export function createProductAnalysisRunner(options: ProductAnalysisRunnerOptions = {}): ProductAnalysisRunner {
  const validator = createProductAnalysisValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `analysis-${++serial}`);
  const clocks = { now, timestamp };

  return {
    validator,
    async run(input) {
      const started = now();
      const recorder = createProductAnalysisRecorder();
      const blank: ProductAnalysisMetadata = {};
      const refused = (issues: ProductAnalysisIssue[], metadata: ProductAnalysisMetadata = blank): ProductAnalysisResult =>
        freezeDeepProductAnalysis({
          status: "REJECTED",
          issues,
          analysis: null,
          snapshot: null,
          metadata,
          executionTime: Math.max(0, now() - started),
          executions: recorder.executions(),
        });

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const source = input as Record<string, unknown>;
        const metadata = copyPlainProductAnalysis({
          ...(isRecord(source.executionMetadata) ? (source.executionMetadata as ProductAnalysisMetadata) : {}),
        });
        const runtimeMetadata = copyPlainProductAnalysis(isRecord(source.runtimeMetadata) ? (source.runtimeMetadata as ProductAnalysisMetadata) : {});
        const configuration = copyPlainProductAnalysis(isRecord(source.configuration) ? (source.configuration as ProductAnalysisMetadata) : {});
        const bundle = { executionMetadata: metadata, runtimeMetadata, configuration };

        const finishStage = (stage: ProductAnalysisStage) => recorder.record(stage);

        finishStage("ClickBankImporter");
        const imported = createClickBankImporter({ ...clocks, idFactory: () => "import-1" }).import({
          marketplaceUrl: source.marketplaceUrl,
          marketplaceProductId: source.marketplaceProductId,
          rawHtml: source.rawHtml,
          ...bundle,
        });
        if (imported.status !== "OK" || imported.facts === null) return refused(issuesOf(imported.issues), metadata);

        const landingPage = textOf(imported.facts.affiliatePage);
        if (landingPage === null) {
          return refused([{ field: "landingPage", message: "Missing ProductFacts: a landing page is required." }], metadata);
        }

        finishStage("LandingPageIntelligence");
        const page = createLandingPageIntelligence({ ...clocks, idFactory: () => "lp-1" }).analyze({
          landingPageUrl: landingPage,
          rawHtml: source.landingHtml,
          ...bundle,
        });
        if (page.status !== "OK" || page.evidence === null) return refused(issuesOf(page.issues), metadata);

        finishStage("GoogleSearchIntelligence");
        const search = createGoogleSearchIntelligence({ ...clocks, idFactory: () => "gs-1" }).analyze({
          productFacts: imported.facts,
          productName: imported.facts.productName,
          vendor: imported.facts.vendor,
          category: imported.facts.category,
          landingPage,
          searchContext: source.searchContext,
          ...bundle,
        });
        if (search.status !== "OK" || search.evidence === null) return refused(issuesOf(search.issues), metadata);

        finishStage("CompetitionIntelligence");
        const competition = createCompetitionIntelligence({ ...clocks, idFactory: () => "cp-1" }).analyze({
          productFacts: imported.facts,
          landingPageEvidence: page.evidence,
          searchEvidence: search.evidence,
          ...bundle,
        });
        if (competition.status !== "OK" || competition.evidence === null) return refused(issuesOf(competition.issues), metadata);

        finishStage("CommercialIntelligence");
        const commercial = createCommercialIntelligence({ ...clocks, idFactory: () => "cm-1" }).analyze({
          productFacts: imported.facts,
          landingPageEvidence: page.evidence,
          searchEvidence: search.evidence,
          competitionEvidence: competition.evidence,
          ...bundle,
        });
        if (commercial.status !== "OK" || commercial.evidence === null) return refused(issuesOf(commercial.issues), metadata);

        finishStage("ProductIntelligenceReport");
        const report = createProductIntelligenceReport({ ...clocks, idFactory: () => "report-1" }).build({
          productFacts: imported.facts,
          landingPageEvidence: page.evidence,
          searchEvidence: search.evidence,
          competitionEvidence: competition.evidence,
          commercialEvidence: commercial.evidence,
          ...bundle,
        });
        if (report.status !== "OK" || report.report === null || report.graph === null) return refused(issuesOf(report.issues), metadata);

        finishStage("Discovery");
        const adapted = createProductOpportunityAdapter({ ...clocks, idFactory: () => "mapping-1" }).adapt({
          productIntelligenceReport: report.report,
          evidenceGraph: report.graph,
          productFacts: imported.facts,
          landingPageEvidence: page.evidence,
          searchEvidence: search.evidence,
          competitionEvidence: competition.evidence,
          commercialEvidence: commercial.evidence,
          ...bundle,
        });
        if (adapted.status !== "OK" || adapted.discoveryContext === null || adapted.evidenceProvider === null) {
          return refused(issuesOf(adapted.issues), metadata);
        }

        finishStage("Opportunity");
        const signals = createSignalPipeline();
        signals.register(observationSignal());
        const opportunity = await createOpportunityResolver({ ...clocks, idFactory: () => "opportunity-1", signals }).resolve({
          candidate: adapted.discoveryContext,
          evidenceContext: adapted.evidenceProvider,
          ...bundle,
        });
        if (opportunity.status !== "COMPLETED" || opportunity.candidateId !== adapted.discoveryContext.id) {
          return refused(
            [{ field: "opportunity", message: opportunity.errors[0] ?? "The Opportunity analysis did not complete." }],
            metadata,
          );
        }

        finishStage("Traffic");
        const trafficSignals = createTrafficSignalPipeline();
        trafficSignals.register(observationTrafficSignal());
        const traffic = await createTrafficResolver({ ...clocks, idFactory: () => "traffic-1", signals: trafficSignals }).resolve({
          candidate: adapted.discoveryContext,
          opportunityAnalysis: opportunity,
          ...bundle,
        });
        if (traffic.status !== "COMPLETED" || traffic.candidateId !== adapted.discoveryContext.id || traffic.opportunityAnalysisId !== opportunity.analysisId) {
          return refused([{ field: "traffic", message: traffic.errors[0] ?? "The Traffic analysis did not complete." }], metadata);
        }

        finishStage("Decision");
        const decision = await createDecisionResolver({ ...clocks, idFactory: () => "decision-1" }).resolve({
          candidate: adapted.discoveryContext,
          opportunityAnalysis: {
            id: opportunity.analysisId,
            candidateId: opportunity.candidateId,
            status: "COMPLETED",
            createdAt: opportunity.startedAt,
            completedAt: opportunity.completedAt,
            version: 1,
          },
          trafficAnalysis: {
            id: traffic.analysisId,
            candidateId: traffic.candidateId,
            opportunityAnalysisId: opportunity.analysisId,
            status: "COMPLETED",
            createdAt: traffic.startedAt,
            completedAt: traffic.completedAt,
            version: 1,
          },
          pageAnalysis: { id: textOf(page.snapshot?.evidenceId) ?? "lp-1" },
          ...bundle,
          extensions: {},
        });
        if (typeof decision.analysisId !== "string" || decision.analysisId.trim() === "") {
          return refused([{ field: "decision", message: "The Decision analysis did not complete." }], metadata);
        }

        finishStage("Workflow");
        const workflow = createWorkflowStateMachine(clocks).apply({
          from: "CREATED",
          to: "DISCOVERED",
          context: {
            decisionAnalysis: { id: decision.analysisId },
            decisionStatus: decision.decisionStatus,
            decisionMetadata: {},
            executionMetadata: metadata,
            runtimeMetadata,
            configuration,
          },
          metadata: { workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID },
        });
        if (workflow.status !== "APPLIED" || workflow.snapshot === null) return refused(issuesOf(workflow.issues), metadata);

        finishStage("ExecutionPlanner");
        const plan = createExecutionPlanBuilder({ ...clocks, idFactory: () => "plan-1" }).build({
          decisionAnalysis: { id: decision.analysisId },
          workflowSnapshot: { id: PRODUCT_ANALYSIS_WORKFLOW_ID },
          results: [
            {
              taskId: "task-draft",
              status: "READY",
              warnings: [],
              metadata: {},
              estimatedDuration: null,
              dependencies: { requires: [], optional: [], conflicts: [] },
              executionOrder: 0,
            },
          ],
          ...bundle,
        });
        if (plan.status !== "OK" || plan.plan === null || plan.snapshot === null) return refused(issuesOf(plan.issues), metadata);

        finishStage("GoogleAdsCampaignBuilder");
        const draft = createGoogleAdsCampaignBuilder({ ...clocks, idFactory: () => "campaign-1" }).build({
          executionPlan: { id: plan.snapshot.planId },
          executionContracts: [{ id: "contract-draft" }],
          decisionAnalysis: { id: decision.analysisId },
          workflowSnapshot: { id: PRODUCT_ANALYSIS_WORKFLOW_ID },
          ...bundle,
          ...draftCampaign(),
        });
        if (draft.status !== "OK" || draft.model === null) return refused(issuesOf(draft.issues), metadata);

        const executions = recorder.executions();
        const executionIssues = validator.validateExecutions(executions);
        if (executionIssues.length > 0) return refused(executionIssues, metadata);

        const analysis = freezeDeepProductAnalysis({
          productFacts: imported.facts,
          landingPageEvidence: page.evidence,
          searchEvidence: search.evidence,
          competitionEvidence: competition.evidence,
          commercialEvidence: commercial.evidence,
          report: report.report,
          evidenceGraph: report.graph,
          discovery: adapted.discoveryContext,
          opportunityAnalysis: opportunity,
          trafficAnalysis: traffic,
          decisionAnalysis: decision,
          workflow: workflow.snapshot,
          executionPlan: plan.plan,
          googleAdsDraft: draft.model,
          executions,
          executionMetadata: metadata,
        } as unknown as ProductAnalysis);
        const artifactIssues = validator.validateArtifacts(analysis);
        if (artifactIssues.length > 0) return refused(artifactIssues, metadata);

        const productName = textOf(imported.facts.productName) ?? "";
        const snapshot = createProductAnalysisSnapshot({
          analysisId: idFactory(),
          productName,
          landingPage,
          createdAt: timestamp(),
          metadata: { modules: executions.length },
        });
        return freezeDeepProductAnalysis({
          status: "OK",
          issues: [],
          analysis,
          snapshot,
          metadata,
          executionTime: Math.max(0, now() - started),
          executions,
        });
      } catch (error) {
        return refused([{ field: "pipeline", message: error instanceof Error ? error.message : "The product analysis stopped." }]);
      }
    },
  };
}
