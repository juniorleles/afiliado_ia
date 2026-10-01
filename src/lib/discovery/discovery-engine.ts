/**
 * Discovery Foundation: engine contract.
 *
 * Interface only. The engine composes the registry, store, and queue; no
 * scheduling, processing, or scoring ships in this step.
 */
import type { DiscoveryQueueManager } from "./discovery-queue-manager";
import type { DiscoveryRegistry } from "./discovery-registry";
import type { DiscoveryStore } from "./discovery-store";
import type { DiscoveryJob } from "./discovery-types";

export interface DiscoveryEngineDependencies {
  registry: DiscoveryRegistry;
  store: DiscoveryStore;
  /** The single entry point for every discovered candidate. */
  queue: DiscoveryQueueManager;
}

export interface DiscoveryEngine {
  /** Runs discovery for one registered source and records the job. */
  runSource(sourceId: string): Promise<DiscoveryJob>;
}
