/**
 * Host record domain: product identifier.
 *
 * Turns read-only landing page snapshots into a frozen product identity and
 * the page evidence it was copied from. It restates fields the page already
 * shows. It does not choose an order, does not name a listing that the page
 * does not show, and does not reach an outside system. A refused input
 * returns REJECTED with issues and no snapshot. This method never throws.
 */
import type { LandingPageSnapshot } from "./landing-page-snapshot";
import { createProductParser, type ProductParser } from "./product-parser";
import { createProductSnapshot, type ProductSnapshot } from "./product-snapshot";
import { copyPlainProduct, createProductStatistics, freezeDeepProduct, type IdentificationEvidence, type IdentificationMetadata, type ObservedProduct, type ProductIdentity, type ProductIssue, type ProductMetadata, type ProductStatistics } from "./product-types";
import { createProductValidator, snapshotsOf, type ProductValidator } from "./product-validator";

export type ProductClock = () => number;
export type ProductTimestamp = () => string;
export type ProductIdFactory = () => string;

export interface ProductIdentifierResult {
  status: "OK" | "REJECTED";
  issues: ProductIssue[];
  snapshot: ProductSnapshot | null;
  products: readonly ObservedProduct[] | null;
  identities: readonly ProductIdentity[] | null;
  evidence: readonly IdentificationEvidence[] | null;
  metadata: IdentificationMetadata;
  statistics: ProductStatistics;
  executionTime: number;
}

export interface ProductIdentifier {
  readonly parser: ProductParser;
  readonly validator: ProductValidator;
  identify(input: unknown): ProductIdentifierResult;
  getSnapshot(identificationId: string): ProductSnapshot | null;
}

export interface ProductIdentifierOptions {
  parser?: ProductParser;
  validator?: ProductValidator;
  now?: ProductClock;
  timestamp?: ProductTimestamp;
  idFactory?: ProductIdFactory;
}

const defaultClock: ProductClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: ProductIssue[], metadata: IdentificationMetadata, executionTime = 0): ProductIdentifierResult {
  return {
    status: "REJECTED",
    issues,
    snapshot: null,
    products: null,
    identities: null,
    evidence: null,
    metadata,
    statistics: createProductStatistics({ pageCount: 0, issueCount: issues.length, executionTime }),
    executionTime,
  };
}

export function createProductIdentifier(options: ProductIdentifierOptions = {}): ProductIdentifier {
  const parser = options.parser ?? createProductParser();
  const validator = options.validator ?? createProductValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `identification-${++serial}`);
  const snapshots = new Map<string, ProductSnapshot>();

  return {
    parser,
    validator,
    getSnapshot: (identificationId) => snapshots.get(identificationId) ?? null,
    identify(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainProduct(input.executionMetadata as ProductMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const products: ObservedProduct[] = [];
        for (const page of snapshotsOf(input) as LandingPageSnapshot[]) {
          const parsed = parser.parse(page.html);
          if (parsed.issues.length > 0 || parsed.identity === null) return refused(parsed.issues, metadata, Math.max(0, now() - start));
          const identity: ProductIdentity = { landingPageId: page.landingPageId, ...parsed.identity };
          const evidence: IdentificationEvidence = { landingPageId: page.landingPageId, ...parsed.evidence };
          products.push({ identity, evidence, metadata: { ...metadata }, confidenceInputs: { ...parsed.confidenceInputs } });
        }
        const identities = products.map((product) => product.identity);
        const evidence = products.map((product) => product.evidence);
        const executionTime = Math.max(0, now() - start);
        const snapshot = createProductSnapshot({ identificationId: id, products, identities, evidence, createdAt, metadata });
        const snapshotIssues = validator.validateIdentification(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepProduct({
          status: "OK",
          issues: [],
          snapshot,
          products: snapshot.products,
          identities: snapshot.identities,
          evidence: snapshot.evidence,
          metadata,
          statistics: createProductStatistics({ pageCount: identities.length, issueCount: 0, executionTime }),
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "identifier", message: error instanceof Error ? error.message : "Invalid Metadata: the identifier could not restate the page." }], {});
      }
    },
  };
}
