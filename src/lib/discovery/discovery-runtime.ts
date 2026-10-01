/**
 * Discovery runtime: the in-memory instances the admin screens share.
 *
 * Server processes keep one registry, queue, and scheduler on globalThis so
 * pages and server actions see the same state. Nothing is persisted: state
 * starts empty and resets when the server restarts. No source is registered
 * here and nothing is executed.
 */
import { createDiscoveryQueueManager, type DiscoveryQueueManager } from "./discovery-queue-manager";
import { createReferenceLookup } from "./discovery-queue-resolver";
import { createDiscoveryRegistry, type DiscoveryRegistry } from "./discovery-registry";
import { createScheduleSourceLookup } from "./discovery-schedule-resolver";
import { createDiscoveryScheduler, type DiscoveryScheduler } from "./discovery-scheduler";
import type { DiscoveryAdminState } from "./discovery-admin";

export interface DiscoveryRuntime {
  registry: DiscoveryRegistry;
  queue: DiscoveryQueueManager;
  scheduler: DiscoveryScheduler;
}

export function createDiscoveryRuntime(): DiscoveryRuntime {
  const registry = createDiscoveryRegistry();
  return {
    registry,
    // There is no candidate store yet, so no candidate can be enqueued.
    queue: createDiscoveryQueueManager({ lookup: createReferenceLookup(registry, () => false) }),
    scheduler: createDiscoveryScheduler({ lookup: createScheduleSourceLookup(registry) }),
  };
}

const globalKey = "__afiliadoDiscoveryRuntime";

export function getDiscoveryRuntime(): DiscoveryRuntime {
  const scope = globalThis as unknown as Record<string, DiscoveryRuntime | undefined>;
  return (scope[globalKey] ??= createDiscoveryRuntime());
}

export function readDiscoveryState(runtime: DiscoveryRuntime): DiscoveryAdminState {
  return {
    sources: runtime.registry.list(),
    queueItems: runtime.queue.list(),
    schedules: runtime.scheduler.list(),
  };
}
