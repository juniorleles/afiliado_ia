/**
 * Host record domain: search provider factory.
 *
 * Selects one registered provider and asks it to restate a supplied search
 * page. A missing name stores nothing. This method never throws and does not
 * reach an outside system.
 */
import { createMockSearchProvider } from "./providers/mock-search-provider";
import { createSearchProviderRegistry, type SearchProviderRegistry } from "./search-provider-registry";
import { createSearchProviderValidator, type SearchProviderValidator } from "./search-provider-validator";
import { copyPlainSearchProvider, freezeDeepSearchProvider, type ProviderConfiguration, type SearchIssue, type SearchMetadata, type SearchResponse } from "./search-provider-types";

export type SearchProviderClock = () => number;
export type SearchProviderTimestamp = () => string;
export type SearchProviderIdFactory = () => string;

export interface SearchProviderFactory {
  readonly registry: SearchProviderRegistry;
  readonly validator: SearchProviderValidator;
  search(input: unknown): SearchResponse;
  configuration(): ProviderConfiguration;
}

export interface SearchProviderFactoryOptions {
  registry?: SearchProviderRegistry;
  validator?: SearchProviderValidator;
  now?: SearchProviderClock;
  timestamp?: SearchProviderTimestamp;
  idFactory?: SearchProviderIdFactory;
}

const defaultClock: SearchProviderClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is SearchResponse {
  return isRecord(value) && (value.status === "OK" || value.status === "REJECTED") && Array.isArray(value.issues) && "snapshot" in value && isRecord(value.metadata) && typeof value.executionTime === "number";
}

function emptyRegistry(validator: SearchProviderValidator): SearchProviderFactory {
  const configuration = (): ProviderConfiguration => freezeDeepSearchProvider({ providers: [], origin: "REGISTERED", provenance: "DIRECT_SOURCE" });
  const refused = (): SearchResponse => freezeDeepSearchProvider({
    status: "REJECTED",
    issues: [{ field: "provider", message: "Missing Provider: a registered provider is required." }],
    snapshot: null,
    metadata: {},
    executionTime: 0,
  });
  return {
    registry: {
      register: () => [{ field: "provider", message: "Missing Provider: a registered provider is required." }],
      get: () => null,
      list: () => [],
      configuration,
    },
    validator,
    search: () => refused(),
    configuration,
  };
}

export function createSearchProviderFactory(options: SearchProviderFactoryOptions = {}): SearchProviderFactory {
  const validator = options.validator ?? createSearchProviderValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const registry = options.registry ?? createSearchProviderRegistry([
    createMockSearchProvider({ validator, now, timestamp, idFactory: options.idFactory }),
  ], validator).registry;
  if (registry === null) return emptyRegistry(validator);

  function refused(issues: SearchIssue[], metadata: SearchMetadata = {}, executionTime = 0): SearchResponse {
    return freezeDeepSearchProvider({
      status: "REJECTED",
      issues,
      snapshot: null,
      metadata,
      executionTime,
    });
  }

  return {
    registry,
    validator,
    configuration: () => registry.configuration(),
    search(input) {
      try {
        const start = now();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainSearchProvider(input.executionMetadata as SearchMetadata) : {};
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues, metadata, Math.max(0, now() - start));
        const provider = registry.get(input.provider as string);
        if (provider === null) return refused([{ field: "provider", message: "Missing Provider: a registered provider is required." }], metadata, Math.max(0, now() - start));
        const result = provider.search(input);
        if (!isResponse(result)) {
          return refused([{ field: "provider", message: "Invalid Provider Contract: the provider response is not a search response." }], metadata, Math.max(0, now() - start));
        }
        return freezeDeepSearchProvider(result);
      } catch {
        return refused([{ field: "provider", message: "Invalid Provider Contract: the provider could not restate the page." }]);
      }
    },
  };
}
