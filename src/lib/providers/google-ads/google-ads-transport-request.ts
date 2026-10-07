/**
 * Host record domain: request transport.
 *
 * Prepares and serializes a read-only request model into one frozen prepared
 * request. It does not reach an outside system, authenticate, or send a
 * record. This layer stays offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  copyPlainGoogleAdsTransport,
  freezeDeepGoogleAdsTransport,
  serializeGoogleAdsTransportBody,
  type GoogleAdsPreparedRequest,
  type GoogleAdsTransportMode,
  type GoogleAdsTransportVersion,
} from "./google-ads-transport-snapshot";

export interface GoogleAdsRequestTransportInit {
  id: string;
  requestModel: unknown;
  version: GoogleAdsTransportVersion;
  mode: GoogleAdsTransportMode;
  metadata?: GoogleAdsMetadata;
  createdAt: string;
}

export interface GoogleAdsRequestTransport {
  serialize(requestModel: unknown): { body: Record<string, unknown>; text: string };
  prepare(init: GoogleAdsRequestTransportInit): GoogleAdsPreparedRequest;
}

export function createGoogleAdsRequestTransport(): GoogleAdsRequestTransport {
  return {
    serialize(requestModel) {
      return serializeGoogleAdsTransportBody(requestModel);
    },
    prepare(init) {
      const serialized = serializeGoogleAdsTransportBody(init.requestModel);
      const payloadId =
        typeof init.requestModel === "object" && init.requestModel !== null && "id" in init.requestModel && typeof (init.requestModel as { id?: unknown }).id === "string"
          ? (init.requestModel as { id: string }).id
          : init.id;
      return freezeDeepGoogleAdsTransport({
        id: init.id,
        payloadId,
        version: init.version,
        mode: init.mode,
        body: serialized.body,
        text: serialized.text,
        metadata: copyPlainGoogleAdsTransport(init.metadata ?? {}),
        createdAt: init.createdAt,
      });
    },
  };
}
