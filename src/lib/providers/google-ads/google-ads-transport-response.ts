/**
 * Host record domain: response transport.
 *
 * Prepares and deserializes a local offline response record. It does not
 * reach an outside system, authenticate, or send a record. This layer stays
 * offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  copyPlainGoogleAdsTransport,
  deserializeGoogleAdsTransportBody,
  freezeDeepGoogleAdsTransport,
  serializeGoogleAdsTransportBody,
  type GoogleAdsPreparedResponse,
  type GoogleAdsTransportMode,
  type GoogleAdsTransportVersion,
} from "./google-ads-transport-snapshot";

export interface GoogleAdsResponseTransportInit {
  id: string;
  requestId: string;
  payloadId: string;
  version: GoogleAdsTransportVersion;
  mode: GoogleAdsTransportMode;
  record?: unknown;
  metadata?: GoogleAdsMetadata;
  createdAt: string;
}

export interface GoogleAdsResponseTransport {
  deserialize(record: unknown): Record<string, unknown>;
  prepare(init: GoogleAdsResponseTransportInit): GoogleAdsPreparedResponse;
}

export function createGoogleAdsResponseTransport(): GoogleAdsResponseTransport {
  return {
    deserialize(record) {
      return deserializeGoogleAdsTransportBody(record);
    },
    prepare(init) {
      const body = init.record === undefined
        ? { status: "OFFLINE", payloadId: init.payloadId, requestId: init.requestId }
        : deserializeGoogleAdsTransportBody(init.record);
      const serialized = serializeGoogleAdsTransportBody(body);
      return freezeDeepGoogleAdsTransport({
        id: init.id,
        requestId: init.requestId,
        version: init.version,
        mode: init.mode,
        status: "OFFLINE",
        body: serialized.body,
        text: serialized.text,
        metadata: copyPlainGoogleAdsTransport(init.metadata ?? {}),
        createdAt: init.createdAt,
      });
    },
  };
}
