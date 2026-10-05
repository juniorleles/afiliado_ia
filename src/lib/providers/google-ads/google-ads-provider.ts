/**
 * Host record domain: provider contract.
 *
 * Interface only. The host composes the registry and the validator to turn a
 * read-only context into an immutable model. It does not reach an outside
 * system, authenticate, send a record, write a store, call a model, or change
 * a workflow stage. No HTTP, token, or send path ships in this step.
 */
import type { GoogleAdsContext } from "./google-ads-context";
import type { GoogleAdsRegistry } from "./google-ads-registry";
import type { GoogleAdsModel } from "./google-ads-types";
import type { GoogleAdsValidator } from "./google-ads-validator";

export interface GoogleAdsProviderDependencies {
  registry: GoogleAdsRegistry;
  validator: GoogleAdsValidator;
}

export interface GoogleAdsProvider {
  /** Reads the context by id and returns an immutable model. Does not send work. */
  model(context: GoogleAdsContext): Promise<GoogleAdsModel>;
  getModel(id: string): GoogleAdsModel | null;
}
