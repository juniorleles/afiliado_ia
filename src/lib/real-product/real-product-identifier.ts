/**
 * Host record domain: real product identifier.
 *
 * Turns landing page snapshots into frozen observed products. It copies
 * fields the page already shows. It does not request a page, choose a
 * product, or reach an outside system. A refused page stops the walk.
 * This method never throws.
 */
import type { RealProductMetadata } from "./product-context";
import { createProductEvidenceBuilder, createRealProductSessionSnapshot, createRealProductStatistics, freezeDeepRealProduct, type ProductEvidenceBuilder, type RealObservedProduct, type RealProductIssue, type RealProductResult } from "./product-evidence-builder";
import { createProductHtmlParser, type ProductHtmlParser } from "./product-html-parser";
import { createRealProductValidator, type RealProductValidator } from "./product-validator";

export type RealProductClock = () => number;
export type RealProductTimestamp = () => string;
export type RealProductIdFactory = () => string;

export interface RealProductIdentifierOptions {
  now?: RealProductClock;
  timestamp?: RealProductTimestamp;
  idFactory?: RealProductIdFactory;
  parser?: ProductHtmlParser;
  builder?: ProductEvidenceBuilder;
  validator?: RealProductValidator;
}

export interface RealProductIdentifier {
  readonly validator: RealProductValidator;
  identify(input: unknown): RealProductResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createRealProductIdentifier(options: RealProductIdentifierOptions = {}): RealProductIdentifier {
  const validator = options.validator ?? createRealProductValidator();
  const parser = options.parser ?? createProductHtmlParser();
  const builder = options.builder ?? createProductEvidenceBuilder();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `product-session-${++serial}`);

  return {
    validator,
    identify(input) {
      const started = now();
      const refused = (issues: RealProductIssue[], metadata: RealProductMetadata = {}): RealProductResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRealProduct({
          status: "REJECTED",
          issues,
          products: null,
          graph: null,
          statistics: createRealProductStatistics({ pageCount: 0, observedProductCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const sessionId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? { ...input.executionMetadata } as RealProductMetadata : {};
        const pages = input.landingPageSnapshots as readonly Record<string, unknown>[];
        const products: RealObservedProduct[] = [];
        for (let index = 0; index < pages.length; index += 1) {
          const page = pages[index] ?? {};
          const html = page.html;
          if (typeof html !== "string") return refused([{ field: `landingPageSnapshots.${index}.html`, message: "Malformed HTML: html must be text." }], metadata);
          const read = parser.read(html);
          if (read.productName === null) {
            return refused([{ field: `landingPageSnapshots.${index}.productName`, message: "Missing Product Evidence: a product name shown on the page is required." }], metadata);
          }
          const landingPageId = typeof page.landingPageId === "string" ? page.landingPageId : "";
          const finalUrl = typeof page.finalUrl === "string" ? page.finalUrl : null;
          products.push(builder.build(landingPageId, finalUrl, read));
        }
        const executionTime = Math.max(0, now() - started);
        const statistics = createRealProductStatistics({
          pageCount: pages.length,
          observedProductCount: products.length,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createRealProductSessionSnapshot({
          sessionId,
          products,
          graph: builder.graph(products),
          statistics,
          context: { landingPageIds: pages.map((page) => (typeof page.landingPageId === "string" ? page.landingPageId : "")) },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        return freezeDeepRealProduct({
          status: "OK",
          issues: [],
          products: snapshot.products,
          graph: snapshot.graph,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "identifier", message: "Missing Metadata: the identifier could not restate the pages." }]);
      }
    },
  };
}
