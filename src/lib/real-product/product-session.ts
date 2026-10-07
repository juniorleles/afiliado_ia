/**
 * Host record domain: real product session.
 *
 * One entry point from landing page snapshots to frozen observed products.
 * It stores a session in memory. A refused identification returns REJECTED
 * and stores nothing. This method never throws.
 */
import { createRealProductIdentifier, type RealProductIdentifierOptions } from "./real-product-identifier";
import { freezeDeepRealProduct, type RealProductResult, type RealProductSessionSnapshot } from "./product-evidence-builder";
import type { RealProductValidator } from "./product-validator";

export interface RealProductSession {
  readonly validator: RealProductValidator;
  identify(input: unknown): RealProductResult;
  getSnapshot(sessionId: string): RealProductSessionSnapshot | null;
}

export function createRealProductSession(options: RealProductIdentifierOptions = {}): RealProductSession {
  const identifier = createRealProductIdentifier(options);
  const snapshots = new Map<string, RealProductSessionSnapshot>();
  return {
    validator: identifier.validator,
    identify(input) {
      try {
        const result = identifier.identify(input);
        if (result.status === "OK" && result.snapshot !== null) snapshots.set(result.snapshot.sessionId, result.snapshot);
        return result;
      } catch {
        return freezeDeepRealProduct({
          status: "REJECTED",
          issues: [{ field: "identifier", message: "Missing Metadata: the identifier could not restate the pages." }],
          products: null,
          graph: null,
          statistics: { pageCount: 0, observedProductCount: 0, issueCount: 1, executionTime: 0 },
          snapshot: null,
          metadata: {},
          executionTime: 0,
        });
      }
    },
    getSnapshot: (sessionId) => snapshots.get(sessionId) ?? null,
  };
}
