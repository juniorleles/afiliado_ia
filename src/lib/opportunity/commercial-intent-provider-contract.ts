/**
 * Commercial Intent Signal: the provider contract.
 *
 * What a commercial-intent evidence provider supplies. It is the contract for
 * the COMMERCIAL_INTENT kind of the Evidence Provider Framework, so providers
 * register in the same resolver as every other kind and the signal reaches
 * their evidence the same way.
 *
 * A provider speaks for one channel and reports observations: statements of
 * what it found, each tagged with the commercial-intent dimension it is
 * evidence about. Interpretation belongs to the provider; the signal only
 * notes which dimensions have observations. The channel travels with the
 * evidence as provenance and the signal never branches on it, so a new channel
 * needs a new provider and no change to the signal.
 *
 * Nothing here implements a provider. The channels are names a future provider
 * may claim; none has logic, and none is registered.
 *
 * An observation says what a source said. It is not an independently verified
 * fact. A provider must report only what it actually observed, and a provider
 * that observed nothing returns no payload or an empty list: absence is never
 * filled in.
 *
 * Every outside reference is a type-only import.
 */
import type { CommercialIntentDimension } from "./commercial-intent-result";
import type { EvidenceProvider } from "./providers/evidence-provider-contract";

/** The channels a provider may speak for. FUTURE is the room left for others. */
export const COMMERCIAL_INTENT_CHANNELS = ["GOOGLE", "SEO", "MARKETPLACE", "AFFILIATE", "SOCIAL", "EMAIL", "FUTURE"] as const;
export type CommercialIntentChannel = (typeof COMMERCIAL_INTENT_CHANNELS)[number];

/** The only keys an observation may carry. There is no strength, score, or rating. */
export const COMMERCIAL_INTENT_OBSERVATION_KEYS = ["dimension", "evidence", "sourceUrl"] as const;
/** The only keys a payload may carry. */
export const COMMERCIAL_INTENT_PAYLOAD_KEYS = ["channel", "observations"] as const;

export interface CommercialIntentObservation {
  /** The dimension this observation is evidence about. */
  readonly dimension: CommercialIntentDimension;
  /** What was observed, in plain words. Required and never empty. */
  readonly evidence: string;
  /** Where it was observed, when there is a page to point to. */
  readonly sourceUrl?: string;
}

/** What a commercial-intent provider returns. */
export interface CommercialIntentEvidence {
  readonly channel: CommercialIntentChannel;
  readonly observations: readonly CommercialIntentObservation[];
}

/** A provider of commercial-intent evidence. */
export type CommercialIntentProviderContract = EvidenceProvider<"COMMERCIAL_INTENT">;
