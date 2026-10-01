import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVERY_SYSTEM_VERSION,
  QUEUE_PANEL_ITEM_LIMIT,
  buildDashboard,
  buildHealth,
  buildQueuePanel,
  buildSchedulerPanel,
  buildStatistics,
  formatDuration,
  parseSourceQuery,
  scheduleActions,
  searchSources,
  sourceActions,
  sourceCapabilities,
  toSourceRow,
  type DiscoveryAdminState,
} from "../src/lib/discovery/discovery-admin";
import { createDiscoveryQueue } from "../src/lib/discovery/discovery-queue";
import { createDiscoveryRuntime, getDiscoveryRuntime, readDiscoveryState } from "../src/lib/discovery/discovery-runtime";
import { createDiscoveryScheduler } from "../src/lib/discovery/discovery-scheduler";
import { createScheduleSourceLookup } from "../src/lib/discovery/discovery-schedule-resolver";
import { createDiscoveryRegistry } from "../src/lib/discovery/discovery-registry";
import type { DiscoverySource } from "../src/lib/discovery/discovery-types";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const HOUR = 3_600_000;

function source(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "alpha-feed",
    name: "Alpha Feed",
    provider: "Fictional Provider",
    category: "AFFILIATE_MARKETPLACE",
    enabled: true,
    priority: 50,
    discoveryType: "API",
    supportsApi: true,
    supportsCrawler: false,
    supportsSearch: false,
    supportsPagination: true,
    supportsScheduling: true,
    status: "ACTIVE",
    ...overrides,
  };
}

function clock() {
  let current = T0;
  return { now: () => new Date(current), advance: (ms: number) => void (current += ms) };
}

const CATALOG: DiscoverySource[] = [
  source({ id: "alpha-feed", name: "Alpha Feed", priority: 50 }),
  source({ id: "beta-search", name: "Beta Search", provider: "Search Co", category: "SEARCH_ENGINE", discoveryType: "SEARCH", supportsApi: false, supportsSearch: true, supportsPagination: false, supportsScheduling: false, priority: 80, status: "EXPERIMENTAL" }),
  source({ id: "gamma-crawl", name: "Gamma Crawl", provider: "Crawl Inc", category: "BRAND_WEBSITE", discoveryType: "CRAWLER", supportsApi: false, supportsCrawler: true, priority: 50, status: "DISABLED", enabled: false }),
  source({ id: "delta-old", name: "Delta Old", provider: "Legacy Ltd", category: "PARTNER_NETWORK", priority: 10, status: "DEPRECATED", enabled: false }),
  source({ id: "epsilon-manual", name: "Epsilon Manual", provider: "Hand Entry", category: "COMMERCE", discoveryType: "MANUAL", supportsApi: false, supportsPagination: false, supportsScheduling: false, priority: 5 }),
];

function main() {
  // Formatting
  check("formatDuration null is a dash", formatDuration(null) === "—");
  check("formatDuration zero", formatDuration(0) === "0s");
  check("formatDuration sub-second", formatDuration(400) === "<1s");
  check("formatDuration seconds", formatDuration(45_000) === "45s");
  check("formatDuration minutes and seconds", formatDuration(90_000) === "1m 30s");
  check("formatDuration hours drop seconds", formatDuration(HOUR + 61_000) === "1h 1m");
  check("formatDuration days", formatDuration(86_400_000) === "1d");

  // Capabilities and rows
  check("capabilities list", sourceCapabilities(CATALOG[0]).join(",") === "API,Pagination,Scheduling");
  check("source with no capabilities", sourceCapabilities(CATALOG[4]).length === 0);
  const row = toSourceRow(CATALOG[1]);
  check("row carries name, provider, type, priority, status", row.name === "Beta Search" && row.provider === "Search Co" && row.type === "SEARCH" && row.priority === 80 && row.status === "EXPERIMENTAL");

  // Source actions
  check("enabled source offers disable", sourceActions(CATALOG[0]).join() === "disable");
  check("disabled source offers enable", sourceActions(CATALOG[2]).join() === "enable");
  check("deprecated source offers no toggle", sourceActions(CATALOG[3]).length === 0);

  // Query parsing
  const defaults = parseSourceQuery({});
  check("default query", defaults.q === "" && defaults.type === null && defaults.status === null && defaults.sort === "priority");
  const parsed = parseSourceQuery({ q: "  beta  ", type: "SEARCH", status: "EXPERIMENTAL", sort: "name" });
  check("query parsed and trimmed", parsed.q === "beta" && parsed.type === "SEARCH" && parsed.status === "EXPERIMENTAL" && parsed.sort === "name");
  const junk = parseSourceQuery({ type: "RSS", status: "PAUSED", sort: "random" });
  check("unknown query values ignored", junk.type === null && junk.status === null && junk.sort === "priority");
  check("array parameter uses the first value", parseSourceQuery({ type: ["API", "SEARCH"] }).type === "API");
  check("query length is capped", parseSourceQuery({ q: "x".repeat(500) }).q.length === 100);

  // Search, filter, sort
  const ids = (list: DiscoverySource[]) => list.map((s) => s.id).join(",");
  check("default sort is priority desc then id", ids(searchSources(CATALOG, defaults)) === "beta-search,alpha-feed,gamma-crawl,delta-old,epsilon-manual");
  check("sort by name", ids(searchSources(CATALOG, { ...defaults, sort: "name" })) === "alpha-feed,beta-search,delta-old,epsilon-manual,gamma-crawl");
  check("search by name", ids(searchSources(CATALOG, { ...defaults, q: "gamma" })) === "gamma-crawl");
  check("search by provider", ids(searchSources(CATALOG, { ...defaults, q: "legacy" })) === "delta-old");
  check("search by id", ids(searchSources(CATALOG, { ...defaults, q: "epsilon-man" })) === "epsilon-manual");
  check("search by category", ids(searchSources(CATALOG, { ...defaults, q: "search_engine" })) === "beta-search");
  check("search is case-insensitive", ids(searchSources(CATALOG, { ...defaults, q: "ALPHA" })) === "alpha-feed");
  check("filter by type", ids(searchSources(CATALOG, { ...defaults, type: "CRAWLER" })) === "gamma-crawl");
  check("filter by status", ids(searchSources(CATALOG, { ...defaults, status: "DEPRECATED" })) === "delta-old");
  check("combined search and filter", ids(searchSources(CATALOG, { ...defaults, q: "feed", type: "API", status: "ACTIVE" })) === "alpha-feed");
  check("no match is empty", searchSources(CATALOG, { ...defaults, q: "zzz" }).length === 0);
  check("search leaves the input untouched", CATALOG[0].id === "alpha-feed" && CATALOG.length === 5);

  // Schedule actions
  check("active schedule: pause, disable", scheduleActions("ACTIVE").join() === "pause,disable");
  check("paused schedule: resume, disable", scheduleActions("PAUSED").join() === "resume,disable");
  check("error schedule: resume, disable", scheduleActions("ERROR").join() === "resume,disable");
  check("disabled schedule: enable", scheduleActions("DISABLED").join() === "enable");

  // Build a realistic state from the real components with a fixed clock
  const time = clock();
  const registry = createDiscoveryRegistry();
  for (const s of CATALOG) registry.register(s);
  const scheduler = createDiscoveryScheduler({ lookup: createScheduleSourceLookup(registry), now: time.now });
  scheduler.createSchedule({ sourceId: "alpha-feed", frequency: "HOURLY", priority: "HIGH" });
  scheduler.createSchedule({ sourceId: "alpha-feed", frequency: "CUSTOM", intervalMinutes: 90 });
  scheduler.createSchedule({ sourceId: "beta-search", frequency: "MANUAL" });
  scheduler.pause("schedule-2");
  const queue = createDiscoveryQueue({ now: time.now });
  queue.enqueue({ candidateId: "c1", sourceId: "alpha-feed" });
  queue.enqueue({ candidateId: "c2", sourceId: "alpha-feed" });
  queue.enqueue({ candidateId: "c3", sourceId: "alpha-feed" });
  queue.enqueue({ candidateId: "c4", sourceId: "alpha-feed" });
  queue.enqueue({ candidateId: "c5", sourceId: "alpha-feed" });
  time.advance(10_000);
  queue.updateStatus("queue-item-1", "PROCESSING");
  time.advance(4_000);
  queue.updateStatus("queue-item-1", "COMPLETED");
  queue.updateStatus("queue-item-2", "PROCESSING");
  time.advance(2_000);
  queue.updateStatus("queue-item-2", "FAILED", { errorMessage: "timeout" });
  queue.updateStatus("queue-item-3", "IGNORED");
  queue.cancel("queue-item-4");
  const state: DiscoveryAdminState = { sources: registry.list(), queueItems: queue.list(), schedules: scheduler.list() };
  const now = time.now();

  // Dashboard
  const dashboard = buildDashboard(state, now);
  check("dashboard source counts", dashboard.registered === 5 && dashboard.enabled === 3 && dashboard.disabled === 1 && dashboard.experimental === 1 && dashboard.deprecated === 1);
  check("dashboard queue summary", dashboard.queue.queued === 1 && dashboard.queue.completed === 1 && dashboard.queue.failed === 1 && dashboard.queue.ignored === 1 && dashboard.queue.processing === 0);
  check("dashboard scheduler summary", dashboard.scheduler.active === 2 && dashboard.scheduler.paused === 1 && dashboard.scheduler.disabled === 0);
  check("dashboard carries overall health", dashboard.health.overall === buildHealth(state, now).overall);

  // Queue panel
  const queuePanel = buildQueuePanel(state);
  check("queue panel counts cancelled", queuePanel.cancelled === 1);
  check("queue panel average wait is the mean of started items", queuePanel.statistics.averageWaitMs === (10_000 + 14_000) / 2);
  check("queue panel average processing", queuePanel.statistics.averageProcessingMs === (4_000 + 2_000) / 2);
  check("queue panel lists items without hiding any", queuePanel.items.length === 5 && queuePanel.hidden === 0);
  const big = createDiscoveryQueue({ now: time.now });
  for (let i = 0; i < QUEUE_PANEL_ITEM_LIMIT + 5; i++) big.enqueue({ candidateId: `b${i}`, sourceId: "alpha-feed" });
  const bigPanel = buildQueuePanel({ ...state, queueItems: big.list() });
  check("queue panel limits displayed items", bigPanel.items.length === QUEUE_PANEL_ITEM_LIMIT && bigPanel.hidden === 5);
  check("empty queue panel", buildQueuePanel({ ...state, queueItems: [] }).statistics.averageWaitMs === null);

  // Scheduler panel
  const schedulerPanel = buildSchedulerPanel(state, now);
  check("scheduler panel rows", schedulerPanel.rows.length === 3);
  check("scheduler row shows source name and status", schedulerPanel.rows[0].sourceName === "Alpha Feed" && schedulerPanel.rows[0].status === "ACTIVE" && schedulerPanel.rows[0].priority === "HIGH");
  check("custom frequency shows its interval", schedulerPanel.rows[1].frequency === "Every 90 min");
  check("scheduler row carries state-specific actions", schedulerPanel.rows[1].actions.join() === "resume,disable" && schedulerPanel.rows[0].actions.join() === "pause,disable");
  check("scheduler row shows next and last run", schedulerPanel.rows[0].nextRun === "2026-01-01T01:00:00.000Z" && schedulerPanel.rows[0].lastRun === null);
  check("missing source has no name", buildSchedulerPanel({ ...state, sources: [] }, now).rows[0].sourceName === null);
  check("scheduler panel reports nothing due yet", schedulerPanel.dueCount === 0);
  check("scheduler panel counts due schedules", buildSchedulerPanel(state, new Date(T0 + 40 * HOUR)).dueCount === 1);

  // Statistics
  const statistics = buildStatistics(state);
  check("statistics counts", statistics.registeredSources === 5 && statistics.configuredSchedules === 3 && statistics.queueSize === 5);
  check("statistics average queue time", statistics.averageQueueTimeMs === 12_000);
  check("statistics capacity", statistics.capacity.automatedSources === 2 && statistics.capacity.schedulableSources === 1);
  check("statistics version", statistics.systemVersion === DISCOVERY_SYSTEM_VERSION && statistics.systemVersion.length > 0);

  // Health
  const empty = buildHealth({ sources: [], queueItems: [], schedules: [] }, now);
  check("empty system warns about missing sources", empty.registry === "WARNING" && empty.overall === "WARNING" && empty.warnings.some((w) => /No discovery sources/.test(w.message)) && empty.errors.length === 0);
  const healthy = buildHealth(
    { sources: [CATALOG[0]], queueItems: [], schedules: [] },
    now,
  );
  check("a valid enabled source is healthy", healthy.overall === "OK" && healthy.warnings.length === 0 && healthy.errors.length === 0);
  check("all sources disabled warns", buildHealth({ sources: [CATALOG[2]], queueItems: [], schedules: [] }, now).registry === "WARNING");
  const brokenSource = buildHealth({ sources: [{ ...CATALOG[0], priority: 5000 }], queueItems: [], schedules: [] }, now);
  check("invalid source is a registry error", brokenSource.registry === "ERROR" && brokenSource.overall === "ERROR" && brokenSource.errors[0].subject === "alpha-feed");
  check("failed queue items warn", dashboard.health.queue === "WARNING" && dashboard.health.warnings.some((w) => /1 queue item failed/.test(w.message)));
  const danglingQueue = buildHealth({ ...state, sources: [CATALOG[0]], schedules: [], queueItems: [{ ...state.queueItems[0], sourceId: "ghost" }] }, now);
  check("queue item with unknown source is an error", danglingQueue.queue === "ERROR");
  const badItem = buildHealth({ ...state, schedules: [], queueItems: [{ ...state.queueItems[0], attempts: -1 }] }, now);
  check("invalid queue item is an error", badItem.queue === "ERROR" && badItem.errors.some((e) => /attempts/.test(e.message)));
  const disabledSourceQueue = buildHealth({ sources: [CATALOG[2]], schedules: [], queueItems: [{ ...state.queueItems[4], sourceId: "gamma-crawl" }] }, now);
  check("pending item for a disabled source warns", disabledSourceQueue.warnings.some((w) => w.scope === "queue" && /not enabled/.test(w.message)));
  const badSchedule = buildHealth({ ...state, queueItems: [], schedules: [{ ...state.schedules[0], timezone: "Mars/Base" }] }, now);
  check("invalid schedule is a scheduler error", badSchedule.scheduler === "ERROR" && badSchedule.errors.some((e) => /timezone/.test(e.message)));
  const errored = buildHealth({ ...state, queueItems: [], schedules: [{ ...state.schedules[0], status: "ERROR" }] }, now);
  check("ERROR-status schedule is a scheduler error", errored.scheduler === "ERROR" && errored.errors.some((e) => /ERROR status/.test(e.message)));
  const orphan = buildHealth({ ...state, queueItems: [], sources: [CATALOG[0]], schedules: [{ ...state.schedules[0], sourceId: "ghost" }] }, now);
  check("schedule with unknown source is an error", orphan.scheduler === "ERROR");
  const offSource = buildHealth({ ...state, queueItems: [], sources: [CATALOG[2]], schedules: [{ ...state.schedules[0], sourceId: "gamma-crawl" }] }, now);
  check("active schedule on a disabled source warns", offSource.warnings.some((w) => w.scope === "scheduler" && /not enabled/.test(w.message)));
  const notSchedulable = buildHealth({ ...state, queueItems: [], sources: [CATALOG[1]], schedules: [{ ...state.schedules[0], sourceId: "beta-search" }] }, now);
  check("schedule on a non-scheduling source warns", notSchedulable.warnings.some((w) => /does not support scheduling/.test(w.message)));
  const overdue = buildHealth(state, new Date(T0 + 40 * HOUR));
  check("due schedules warn and say nothing runs them", overdue.warnings.some((w) => /due\. Planning only/.test(w.message)));
  check("health levels are consistent", ["OK", "WARNING", "ERROR"].includes(overdue.overall));
  check("health does not mutate state", JSON.stringify(state.sources) === JSON.stringify(registry.list()));

  // Runtime
  const a = getDiscoveryRuntime();
  const b = getDiscoveryRuntime();
  check("runtime is shared across calls", a === b);
  check("runtime starts with no sources, items, or schedules", (() => { const s = readDiscoveryState(createDiscoveryRuntime()); return s.sources.length === 0 && s.queueItems.length === 0 && s.schedules.length === 0; })());
  a.registry.register(CATALOG[0]);
  check("runtime state is visible to later readers", readDiscoveryState(getDiscoveryRuntime()).sources.length === 1);
  check("runtime registry toggles work", getDiscoveryRuntime().registry.disable("alpha-feed").status === "DISABLED" && getDiscoveryRuntime().registry.enable("alpha-feed").status === "ACTIVE");
  check("runtime queue cannot enqueue without a candidate store", (() => { try { a.queue.enqueue({ candidateId: "c", sourceId: "alpha-feed" }); return false; } catch { return true; } })());
  delete (globalThis as Record<string, unknown>).__afiliadoDiscoveryRuntime;
  check("a reset runtime is empty again", readDiscoveryState(getDiscoveryRuntime()).sources.length === 0);

  // Isolation
  const root = join(__dirname, "..");
  const libDir = join(root, "src", "lib", "discovery");
  const libText = readdirSync(libDir).map((name) => readFileSync(join(libDir, name), "utf8")).join("\n");
  check("no http, sql, models, timers, workers in discovery lib", !/fetch\(|node:http|getDb|better-sqlite3|anthropic|openai|setInterval|setTimeout|worker_threads|child_process|node-cron|CronJob/i.test(libText));
  check("no imports outside the discovery lib", !/from\s+"(?!\.\/)[^"]*"/.test(libText));

  const adminDir = join(root, "src", "app", "admin", "discovery");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(adminDir);
  const adminText = files.map((file) => readFileSync(file, "utf8")).join("\n");
  check("admin screens call no http, db, model, or timer APIs", !/fetch\(|node:http|getDb|better-sqlite3|anthropic|openai|setInterval|setTimeout|child_process/i.test(adminText));
  check("admin screens never start discovery or process the queue", !/\.discover\(|\.enqueue\(|\.plan\(|\.updateStatus\(|\.retry\(|\.cancel\(|\.clear\(|\.next\(|runSource/.test(adminText));
  check("admin screens do not import importer, facts, grounding, publication, or LP builder", !/lp-builder|product-facts|import-product|grounding|publication|opportunity/i.test(adminText.replace(/Opportunity Engine/g, "")));
  const actionsText = readFileSync(join(adminDir, "actions.ts"), "utf8");
  check("every server action requires admin first", (actionsText.match(/await requireAdmin\(\)/g) ?? []).length === 2 && (actionsText.match(/export async function/g) ?? []).length === 2);
  check("actions only toggle state", /registry\.(enable|disable)\(/.test(actionsText) && /scheduler\.(pause|resume|enable|disable)\(/.test(actionsText) && !/createSchedule|deleteSchedule|updateSchedule|register\(/.test(actionsText));
  check("actions only redirect inside the discovery admin", /startsWith\("\/admin\/discovery"\)/.test(actionsText));
  const pageFiles = files.filter((file) => /page\.tsx$/.test(file));
  check("every page requires admin", pageFiles.every((file) => readFileSync(file, "utf8").includes("await requireAdmin()")));
  check("queue page is read-only", !/<form|action=/.test(readFileSync(join(adminDir, "queue", "page.tsx"), "utf8")));
  check("health page is read-only", !/<form|action=/.test(readFileSync(join(adminDir, "health", "page.tsx"), "utf8")));
  check("dashboard page is read-only", !/<form|action=/.test(readFileSync(join(adminDir, "page.tsx"), "utf8")));
  check("no client components in discovery admin", !/"use client"/.test(adminText));

  console.log(failures === 0 ? "DISCOVERY_ADMIN_TESTS=PASS" : `DISCOVERY_ADMIN_TESTS=FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
