/**
 * Host record domain: read-only ClickBank import context.
 *
 * Interface only. The host is given a marketplace URL, a marketplace product
 * id, raw marketplace HTML, and flat metadata. It does not fetch a page, does
 * not change the input, and does not run another engine.
 */
import type { ClickBankMetadata } from "./clickbank-types";

export const CLICKBANK_CONTEXT_MEMBERS = [
  "marketplaceUrl",
  "marketplaceProductId",
  "rawHtml",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one import may be given. Nothing here is written back to
 * another engine.
 */
export interface ClickBankContext {
  marketplaceUrl: string;
  marketplaceProductId: string;
  rawHtml: string;
  executionMetadata?: ClickBankMetadata;
  runtimeMetadata?: ClickBankMetadata;
  configuration?: ClickBankMetadata;
}
