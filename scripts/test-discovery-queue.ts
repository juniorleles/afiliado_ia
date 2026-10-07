import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DISCOVERY_QUEUE_EVENT_TYPES, type DiscoveryQueueEvent } from "../src/lib/discovery/discovery-queue-events";
import { createDiscoveryQueue, DiscoveryQueueError } from "../src/lib/discovery/discovery-queue";
import { createDiscoveryQueueManager } from "../src/lib/discovery/discovery-queue-manager";
import { createReferenceLookup, orderQueueItems } from "../src/lib/discovery/discovery-queue-resolver";
import { computeQueueStatistics } from "../src/lib/discovery/discovery-queue-statistics";
import {
  validateQueueItem,
  validateStatusTransition,
} from "../src/lib/discovery/discovery-queue-validator";
import { createDiscoveryRegistry } from "../src/lib/discovery/discovery-registry";
import { DISCOVERY_QUEUE_PRIORITIES, DISCOVERY_QUEUE_STATUSES } from "../src/lib/discovery/discovery-types";
let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function throwsQueue(fn: () => unknown, field?: string): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof DiscoveryQueueError && (field === undefined || error.issues.some((i) => i.field === field));
  }
}

function clock(start = Date.parse("2026-01-01T00:00:00.000Z")) {
  let current = start;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function main() {
  check("eight queue statuses", DISCOVERY_QUEUE_STATUSES.join(",") === "NEW,QUEUED,WAITING,PROCESSING,COMPLETED,FAILED,IGNORED,CANCELLED");
  check("four priorities", DISCOVERY_QUEUE_PRIORITIES.join(",") === "LOW,NORMAL,HIGH,CRITICAL");

  const time = clock();
  const queue = createDiscoveryQueue({ now: time.now });

  // Enqueue
  const first = queue.enqueue({ candidateId: "c1", sourceId: "s1", metadata: { note: "a", n: 1 } });
  check("enqueue defaults QUEUED, NORMAL, attempts 0", first.status === "QUEUED" && first.priority === "NORMAL" && first.attempts === 0);
  check("enqueue sets ids, timestamps, nulls", first.id === "queue-item-1" && first.lastAttempt === null && first.errorMessage === null && first.createdAt === first.updatedAt);
  check("new item passes item validation", validateQueueItem(first).length === 0);
  check("enqueue honors initial status NEW", queue.enqueue({ candidateId: "c2", sourceId: "s1", status: "NEW" }).status === "NEW");
  check("enqueue honors priority", queue.enqueue({ candidateId: "c3", sourceId: "s1", priority: "CRITICAL" }).priority === "CRITICAL");

  // Validation
  check("duplicate candidate rejected", throwsQueue(() => queue.enqueue({ candidateId: "c1", sourceId: "s2" }), "candidateId"));
  check("missing candidate rejected", throwsQueue(() => queue.enqueue({ candidateId: " ", sourceId: "s1" }), "candidateId"));
  check("missing source rejected", throwsQueue(() => queue.enqueue({ candidateId: "x", sourceId: "" }), "sourceId"));
  check("invalid priority rejected", throwsQueue(() => queue.enqueue({ candidateId: "x", sourceId: "s1", priority: "URGENT" as never }), "priority"));
  check("invalid initial status rejected", throwsQueue(() => queue.enqueue({ candidateId: "x", sourceId: "s1", status: "COMPLETED" as never }), "status"));
  check("invalid metadata rejected", throwsQueue(() => queue.enqueue({ candidateId: "x", sourceId: "s1", metadata: { deep: { a: 1 } } as never }), "metadata"));
  check("non-object input rejected", throwsQueue(() => queue.enqueue(null as never), "input"));
  check("rejected inputs add nothing", queue.count() === 3);
  const bad = { ...first, attempts: -1 };
  check("negative attempts flagged", validateQueueItem(bad).some((i) => i.field === "attempts"));
  check("fractional attempts flagged", validateQueueItem({ ...first, attempts: 1.5 }).some((i) => i.field === "attempts"));
  check("invalid status flagged", validateQueueItem({ ...first, status: "DONE" }).some((i) => i.field === "status"));
  check("invalid priority flagged", validateQueueItem({ ...first, priority: "MAX" }).some((i) => i.field === "priority"));
  check("missing candidate flagged", validateQueueItem({ ...first, candidateId: "" }).some((i) => i.field === "candidateId"));
  check("missing source flagged", validateQueueItem({ ...first, sourceId: "" }).some((i) => i.field === "sourceId"));
  check("bad timestamp flagged", validateQueueItem({ ...first, createdAt: "never" }).some((i) => i.field === "createdAt"));

  // Copies
  const copy = queue.get(first.id)!;
  copy.metadata.note = "changed";
  copy.status = "FAILED";
  check("returned items are copies", queue.get(first.id)!.metadata.note === "a" && queue.get(first.id)!.status === "QUEUED");
  check("get unknown is null", queue.get("nope") === null);
  check("getByCandidate", queue.getByCandidate("c3")?.id === "queue-item-3" && queue.getByCandidate("zz") === null);

  // Status transitions
  time.advance(1000);
  const started = queue.updateStatus(first.id, "PROCESSING");
  check("processing increments attempts and sets lastAttempt", started.attempts === 1 && started.lastAttempt === started.updatedAt);
  check("processing stamps updatedAt", started.updatedAt !== first.updatedAt);
  check("failed requires error message", throwsQueue(() => queue.updateStatus(first.id, "FAILED"), "errorMessage"));
  time.advance(2000);
  const failed = queue.updateStatus(first.id, "FAILED", { errorMessage: "timeout" });
  check("failed stores message", failed.status === "FAILED" && failed.errorMessage === "timeout");
  check("illegal transition rejected", throwsQueue(() => queue.updateStatus(first.id, "COMPLETED"), "status"));
  check("unknown status rejected", throwsQueue(() => queue.updateStatus(first.id, "DONE" as never), "status"));
  check("unknown item rejected", throwsQueue(() => queue.updateStatus("nope", "QUEUED")));
  time.advance(500);
  const retried = queue.retry(first.id);
  check("retry requeues, clears error, keeps attempts", retried.status === "QUEUED" && retried.errorMessage === null && retried.attempts === 1);
  check("retry of a queued item rejected", throwsQueue(() => queue.retry(first.id), "status"));
  queue.updateStatus(first.id, "PROCESSING");
  const done = queue.updateStatus(first.id, "COMPLETED");
  check("second attempt counts", done.attempts === 2 && done.errorMessage === null);
  check("completed is terminal", validateStatusTransition("COMPLETED", "QUEUED").length > 0 && throwsQueue(() => queue.cancel(first.id)));
  check("ignored is terminal", validateStatusTransition("IGNORED", "QUEUED").length > 0);

  // Cancel / remove
  const cancelled = queue.cancel("queue-item-2");
  check("cancel from NEW", cancelled.status === "CANCELLED");
  check("cancelled can be retried", queue.retry("queue-item-2").status === "QUEUED");
  queue.updateStatus("queue-item-3", "PROCESSING");
  check("processing item cannot be removed", throwsQueue(() => queue.remove("queue-item-3"), "status"));
  check("processing item can be cancelled", queue.cancel("queue-item-3").status === "CANCELLED");
  check("remove deletes and returns the item", queue.remove("queue-item-3").id === "queue-item-3" && queue.get("queue-item-3") === null);
  check("removed candidate can be enqueued again", queue.enqueue({ candidateId: "c3", sourceId: "s1" }).id === "queue-item-4");
  check("ids are not reused", queue.enqueue({ candidateId: "c4", sourceId: "s1" }).id === "queue-item-5");

  // List / count / clear
  check("list keeps insertion order", queue.list().map((i) => i.id).join(",") === "queue-item-1,queue-item-2,queue-item-4,queue-item-5");
  check("list filters by status", queue.list({ status: "COMPLETED" }).length === 1);
  check("list filters by source", queue.list({ sourceId: "s2" }).length === 0);
  check("count matches list", queue.count({ status: "QUEUED" }) === queue.list({ status: "QUEUED" }).length);
  check("clear returns removed count", queue.clear() === 4 && queue.count() === 0);

  // Resolver: priority then age, read-only
  const orderClock = clock();
  const ordered = createDiscoveryQueue({ now: orderClock.now });
  ordered.enqueue({ candidateId: "low-old", sourceId: "s1", priority: "LOW" });
  orderClock.advance(1000);
  ordered.enqueue({ candidateId: "normal-1", sourceId: "s1" });
  orderClock.advance(1000);
  ordered.enqueue({ candidateId: "high", sourceId: "s2", priority: "HIGH" });
  orderClock.advance(1000);
  ordered.enqueue({ candidateId: "critical", sourceId: "s1", priority: "CRITICAL" });
  ordered.enqueue({ candidateId: "waiting", sourceId: "s1", priority: "CRITICAL", status: "WAITING" });
  orderClock.advance(1000);
  ordered.enqueue({ candidateId: "normal-2", sourceId: "s1" });
  const rank = orderQueueItems(ordered.list()).map((i) => i.candidateId).join(",");
  check("order is priority then age", rank === "critical,waiting,high,normal-1,normal-2,low-old");

  const lookup = createReferenceLookup(
    (() => {
      const registry = createDiscoveryRegistry();
      for (const id of ["s1", "s2"]) {
        registry.register({
          id,
          name: id,
          provider: "Fictional",
          category: "COMMERCE",
          enabled: true,
          priority: 10,
          discoveryType: "MANUAL",
          supportsApi: false,
          supportsCrawler: false,
          supportsSearch: false,
          supportsPagination: false,
          supportsScheduling: false,
          status: "ACTIVE",
        });
      }
      return registry;
    })(),
    (candidateId) => !candidateId.startsWith("ghost"),
  );

  // Manager
  const managerClock = clock();
  const manager = createDiscoveryQueueManager({ lookup, now: managerClock.now });
  check("manager rejects unknown candidate", throwsQueue(() => manager.enqueue({ candidateId: "ghost-1", sourceId: "s1" }), "candidateId"));
  check("manager rejects unknown source", throwsQueue(() => manager.enqueue({ candidateId: "m1", sourceId: "nope" }), "sourceId"));
  check("manager rejects invalid input first", throwsQueue(() => manager.enqueue({ candidateId: "", sourceId: "s1" }), "candidateId"));
  check("rejections add nothing", manager.count() === 0);
  manager.enqueue({ candidateId: "m1", sourceId: "s1", priority: "LOW" });
  managerClock.advance(1000);
  manager.enqueue({ candidateId: "m2", sourceId: "s2", priority: "HIGH" });
  managerClock.advance(1000);
  manager.enqueue({ candidateId: "m3", sourceId: "s1", priority: "HIGH" });
  check("manager rejects duplicates", throwsQueue(() => manager.enqueue({ candidateId: "m1", sourceId: "s1" }), "candidateId"));
  check("next is highest priority, oldest", manager.next()?.candidateId === "m2");
  check("next honors source filter", manager.next({ sourceId: "s1" })?.candidateId === "m3");
  check("next does not start the item", manager.get(manager.next()!.id)!.status === "QUEUED" && manager.statistics().processing === 0);
  check("ready lists run order", manager.ready().map((i) => i.candidateId).join(",") === "m2,m3,m1");
  check("next on empty is null", createDiscoveryQueueManager({ lookup }).next() === null);

  // Statistics
  const m2 = manager.next()!;
  managerClock.advance(4000);
  manager.updateStatus(m2.id, "PROCESSING");
  managerClock.advance(6000);
  manager.updateStatus(m2.id, "COMPLETED");
  const m3 = manager.next()!;
  managerClock.advance(2000);
  manager.updateStatus(m3.id, "PROCESSING");
  managerClock.advance(2000);
  manager.updateStatus(m3.id, "FAILED", { errorMessage: "bad" });
  const m1 = manager.next()!;
  manager.updateStatus(m1.id, "IGNORED");
  const stats = manager.statistics();
  check("stats counts", stats.total === 3 && stats.completed === 1 && stats.failed === 1 && stats.ignored === 1 && stats.queued === 0 && stats.processing === 0);
  check("stats byStatus covers all statuses", DISCOVERY_QUEUE_STATUSES.every((s) => typeof stats.byStatus[s] === "number"));
  // m2 created +1000, started +6000 => 5000ms; m3 created +2000, started +14000 => 12000ms
  check("average wait", stats.averageWaitMs === 8500);
  // m2 processed 6000ms, m3 processed 2000ms
  check("average processing", stats.averageProcessingMs === 4000);
  check("empty stats have null averages", computeQueueStatistics([]).averageWaitMs === null && computeQueueStatistics([]).averageProcessingMs === null);
  const waitingOnly = computeQueueStatistics([
    { status: "QUEUED", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastAttempt: null },
  ]);
  check("queued items do not count toward averages", waitingOnly.averageWaitMs === null && waitingOnly.queued === 1);

  // Manager passes through operations
  check("manager cancel/retry/remove", manager.cancel(m3.id).status === "CANCELLED" && manager.retry(m3.id).status === "QUEUED" && manager.remove(m3.id).id === m3.id);
  check("manager clear", manager.clear() === 2 && manager.count() === 0);

  // Events: definitions only
  const event: DiscoveryQueueEvent = { type: "ItemFailed", at: "2026-01-01T00:00:00.000Z", itemId: "i", candidateId: "c", sourceId: "s", errorMessage: "x" };
  check("six event types defined", DISCOVERY_QUEUE_EVENT_TYPES.join(",") === "QueueCreated,ItemQueued,ItemStarted,ItemCompleted,ItemFailed,ItemCancelled" && event.type === "ItemFailed");

  // Isolation
  const dir = join(__dirname, "..", "src", "lib", "discovery");
  const text = readdirSync(dir).map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  check("no http, sql, models, timers, or workers in discovery", !/fetch\(|node:http|getDb|better-sqlite3|anthropic|openai|setInterval|setTimeout|worker_threads|child_process/i.test(text));
  check("no imports outside the discovery module", !/from\s+"(?!\.\/)[^"]*"/.test(text));
  const eventsText = readFileSync(join(dir, "discovery-queue-events.ts"), "utf8");
  check("events file has no emitter", !/EventEmitter|\.emit\(|\.on\(|addEventListener/.test(eventsText));

  console.log(failures === 0 ? "DISCOVERY_QUEUE_TESTS=PASS" : `DISCOVERY_QUEUE_TESTS=FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
