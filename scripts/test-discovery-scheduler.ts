import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDiscoveryRegistry } from "../src/lib/discovery/discovery-registry";
import { createScheduleRegistry } from "../src/lib/discovery/discovery-schedule-registry";
import { DISCOVERY_SCHEDULE_EVENT_TYPES, type DiscoveryScheduleEvent } from "../src/lib/discovery/discovery-schedule-events";
import {
  computeNextRun,
  createScheduleSourceLookup,
  nextOccurrence,
} from "../src/lib/discovery/discovery-schedule-resolver";
import { computeScheduleStatistics } from "../src/lib/discovery/discovery-schedule-statistics";
import { isValidTimezone, validateSchedule } from "../src/lib/discovery/discovery-schedule-validator";
import { createDiscoveryScheduler, DiscoveryScheduleError } from "../src/lib/discovery/discovery-scheduler";
import { DISCOVERY_FREQUENCIES, DISCOVERY_SCHEDULE_STATUSES } from "../src/lib/discovery/discovery-types";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function throwsSchedule(fn: () => unknown, field?: string): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof DiscoveryScheduleError && (field === undefined || error.issues.some((i) => i.field === field));
  }
}

function clock(start: string) {
  let current = Date.parse(start);
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const HOUR = 3_600_000;
const T0 = "2026-01-01T00:00:00.000Z";

function sources() {
  const registry = createDiscoveryRegistry();
  for (const id of ["s1", "s2", "s3"]) {
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
}

function main() {
  check("five frequencies", DISCOVERY_FREQUENCIES.join(",") === "MANUAL,HOURLY,DAILY,WEEKLY,CUSTOM");
  check("four schedule statuses", DISCOVERY_SCHEDULE_STATUSES.join(",") === "ACTIVE,PAUSED,DISABLED,ERROR");

  // Next-run math
  const utc = { timezone: "UTC", intervalMinutes: null };
  const at = (iso: string) => Date.parse(iso);
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  check("hourly adds an hour from the anchor", iso(nextOccurrence({ ...utc, frequency: "HOURLY" }, at(T0), at(T0))) === "2026-01-01T01:00:00.000Z");
  check("hourly catches up past missed runs", iso(nextOccurrence({ ...utc, frequency: "HOURLY" }, at(T0), at("2026-01-01T05:30:00.000Z"))) === "2026-01-01T06:00:00.000Z");
  check("next run is strictly after now", iso(nextOccurrence({ ...utc, frequency: "HOURLY" }, at(T0), at("2026-01-01T03:00:00.000Z"))) === "2026-01-01T04:00:00.000Z");
  check("custom interval", iso(nextOccurrence({ timezone: "UTC", frequency: "CUSTOM", intervalMinutes: 90 }, at(T0), at("2026-01-01T01:00:00.000Z"))) === "2026-01-01T01:30:00.000Z");
  check("custom strictly after on an exact boundary", iso(nextOccurrence({ timezone: "UTC", frequency: "CUSTOM", intervalMinutes: 90 }, at(T0), at("2026-01-01T01:30:00.000Z"))) === "2026-01-01T03:00:00.000Z");
  check("daily keeps today's later occurrence", iso(nextOccurrence({ ...utc, frequency: "DAILY" }, at("2026-01-01T09:00:00.000Z"), at("2026-01-03T08:00:00.000Z"))) === "2026-01-03T09:00:00.000Z");
  check("daily moves on after the occurrence", iso(nextOccurrence({ ...utc, frequency: "DAILY" }, at("2026-01-01T09:00:00.000Z"), at("2026-01-03T09:00:00.000Z"))) === "2026-01-04T09:00:00.000Z");
  check("weekly adds seven days", iso(nextOccurrence({ ...utc, frequency: "WEEKLY" }, at("2026-01-01T10:00:00.000Z"), at("2026-01-02T00:00:00.000Z"))) === "2026-01-08T10:00:00.000Z");
  check("daily keeps local time across daylight saving", iso(nextOccurrence({ timezone: "America/New_York", intervalMinutes: null, frequency: "DAILY" }, at("2026-03-07T14:00:00.000Z"), at("2026-03-07T15:00:00.000Z"))) === "2026-03-08T13:00:00.000Z");
  check("daily in a fixed-offset zone", iso(nextOccurrence({ timezone: "America/Sao_Paulo", intervalMinutes: null, frequency: "DAILY" }, at("2026-01-01T12:00:00.000Z"), at("2026-01-01T13:00:00.000Z"))) === "2026-01-02T12:00:00.000Z");
  check("manual has no next run", nextOccurrence({ ...utc, frequency: "MANUAL" }, at(T0), at(T0)) === null);
  check("computeNextRun anchors on lastRun", computeNextRun({ frequency: "HOURLY", intervalMinutes: null, timezone: "UTC", lastRun: "2026-01-01T00:00:00.000Z" }, new Date("2026-01-01T00:20:00.000Z")) === "2026-01-01T01:00:00.000Z");
  check("computeNextRun anchors on now when never run", computeNextRun({ frequency: "HOURLY", intervalMinutes: null, timezone: "UTC", lastRun: null }, new Date("2026-01-01T00:20:00.000Z")) === "2026-01-01T01:20:00.000Z");

  // Timezone validation
  check("UTC is a valid timezone", isValidTimezone("UTC"));
  check("IANA name is valid", isValidTimezone("America/Sao_Paulo"));
  check("unknown timezone invalid", !isValidTimezone("Mars/Base") && !isValidTimezone("") && !isValidTimezone(5));

  // Scheduler
  const time = clock(T0);
  const registry = sources();
  const scheduler = createDiscoveryScheduler({ lookup: createScheduleSourceLookup(registry), now: time.now });

  const hourly = scheduler.createSchedule({ sourceId: "s1", frequency: "HOURLY", priority: "HIGH" });
  check("create sets defaults", hourly.id === "schedule-1" && hourly.enabled && hourly.status === "ACTIVE" && hourly.timezone === "UTC" && hourly.lastRun === null);
  check("create calculates nextRun", hourly.nextRun === "2026-01-01T01:00:00.000Z");
  check("created schedule validates", validateSchedule(hourly).length === 0);
  const manual = scheduler.createSchedule({ sourceId: "s1", frequency: "MANUAL" });
  check("manual schedule has no nextRun", manual.nextRun === null && manual.intervalMinutes === null);

  // Create validation
  check("duplicate schedule rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s1", frequency: "HOURLY" }), "frequency"));
  check("same source, other timezone allowed", scheduler.createSchedule({ sourceId: "s1", frequency: "HOURLY", timezone: "America/Sao_Paulo" }).id === "schedule-3");
  check("invalid frequency rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "MONTHLY" as never }), "frequency"));
  check("invalid timezone rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", timezone: "Mars/Base" }), "timezone"));
  check("missing source rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "", frequency: "DAILY" }), "sourceId"));
  check("unknown source rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "ghost", frequency: "DAILY" }), "sourceId"));
  check("invalid priority rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", priority: "URGENT" as never }), "priority"));
  check("past nextRun rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", nextRun: "2025-12-31T00:00:00.000Z" }), "nextRun"));
  check("malformed nextRun rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", nextRun: "soon" }), "nextRun"));
  check("custom without interval rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "CUSTOM" }), "intervalMinutes"));
  check("custom zero interval rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "CUSTOM", intervalMinutes: 0 }), "intervalMinutes"));
  check("interval on non-custom rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "HOURLY", intervalMinutes: 30 }), "intervalMinutes"));
  check("manual with nextRun rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "MANUAL", nextRun: "2026-02-01T00:00:00.000Z" }), "nextRun"));
  check("invalid metadata rejected", throwsSchedule(() => scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", metadata: { a: { b: 1 } } as never }), "metadata"));
  check("non-object input rejected", throwsSchedule(() => scheduler.createSchedule(null as never), "input"));
  check("rejected creates add nothing", scheduler.list().length === 3);
  check("explicit future nextRun accepted", scheduler.createSchedule({ sourceId: "s2", frequency: "DAILY", nextRun: "2026-01-05T12:00:00.000Z" }).nextRun === "2026-01-05T12:00:00.000Z");

  // Stored schedules are copies
  const peek = scheduler.get("schedule-1")!;
  peek.status = "DISABLED";
  peek.metadata.x = 1;
  check("returned schedules are copies", scheduler.get("schedule-1")!.status === "ACTIVE" && !("x" in scheduler.get("schedule-1")!.metadata));
  check("get unknown is null", scheduler.get("nope") === null);

  // Update
  const custom = scheduler.updateSchedule("schedule-1", { frequency: "CUSTOM", intervalMinutes: 90 });
  check("update to custom recalculates nextRun", custom.frequency === "CUSTOM" && custom.nextRun === "2026-01-01T01:30:00.000Z");
  check("priority-only update keeps nextRun", scheduler.updateSchedule("schedule-1", { priority: "LOW" }).nextRun === "2026-01-01T01:30:00.000Z");
  const back = scheduler.updateSchedule("schedule-1", { frequency: "HOURLY" });
  check("leaving custom clears the interval", back.intervalMinutes === null && back.nextRun === "2026-01-01T01:00:00.000Z");
  const toManual = scheduler.updateSchedule("schedule-4", { frequency: "MANUAL" });
  check("update to manual clears nextRun", toManual.nextRun === null && toManual.intervalMinutes === null);
  check("update causing a duplicate rejected", throwsSchedule(() => scheduler.updateSchedule("schedule-1", { frequency: "MANUAL" }), "frequency"));
  check("duplicate update leaves the schedule unchanged", scheduler.get("schedule-1")!.frequency === "HOURLY");
  check("update with past nextRun rejected", throwsSchedule(() => scheduler.updateSchedule("schedule-1", { nextRun: "2025-01-01T00:00:00.000Z" }), "nextRun"));
  check("update with invalid timezone rejected", throwsSchedule(() => scheduler.updateSchedule("schedule-1", { timezone: "Nowhere/Land" }), "timezone"));
  check("update with unknown source rejected", throwsSchedule(() => scheduler.updateSchedule("schedule-1", { sourceId: "ghost" }), "sourceId"));
  check("update unknown id rejected", throwsSchedule(() => scheduler.updateSchedule("nope", { priority: "LOW" })));
  check("failed update leaves the schedule unchanged", scheduler.get("schedule-1")!.timezone === "UTC");
  check("update lastRun recalculates nextRun", scheduler.updateSchedule("schedule-1", { lastRun: "2026-01-01T00:00:00.000Z" }).nextRun === "2026-01-01T01:00:00.000Z");

  // Pause / resume / enable / disable / error
  check("pause moves ACTIVE to PAUSED, still enabled", (() => { const s = scheduler.pause("schedule-1"); return s.status === "PAUSED" && s.enabled; })());
  check("pause twice rejected", throwsSchedule(() => scheduler.pause("schedule-1"), "status"));
  time.advance(5 * HOUR);
  const resumed = scheduler.resume("schedule-1");
  check("resume returns to ACTIVE with a fresh future nextRun", resumed.status === "ACTIVE" && Date.parse(resumed.nextRun!) > time.now().getTime());
  check("resume of an active schedule rejected", throwsSchedule(() => scheduler.resume("schedule-1"), "status"));
  const disabled = scheduler.disable("schedule-1");
  check("disable sets DISABLED and enabled=false", disabled.status === "DISABLED" && !disabled.enabled && validateSchedule(disabled).length === 0);
  check("disable is idempotent", scheduler.disable("schedule-1").status === "DISABLED");
  check("pause of a disabled schedule rejected", throwsSchedule(() => scheduler.pause("schedule-1"), "status"));
  const enabled = scheduler.enable("schedule-1");
  check("enable returns to ACTIVE with a future nextRun", enabled.status === "ACTIVE" && enabled.enabled && Date.parse(enabled.nextRun!) > time.now().getTime());
  check("enable is idempotent", scheduler.enable("schedule-1").status === "ACTIVE");
  check("markError sets ERROR", scheduler.markError("schedule-1").status === "ERROR");
  check("resume recovers from ERROR", scheduler.resume("schedule-1").status === "ACTIVE");
  scheduler.disable("schedule-1");
  check("markError on disabled rejected", throwsSchedule(() => scheduler.markError("schedule-1"), "status"));
  scheduler.enable("schedule-1");

  // Calculate next run
  const stale = scheduler.updateSchedule("schedule-1", { lastRun: "2026-01-01T00:00:00.000Z", nextRun: time.now().toISOString() });
  void stale;
  time.advance(30 * 60_000);
  const calculated = scheduler.calculateNextRun("schedule-1");
  check("calculateNextRun returns and stores a future time", calculated !== null && Date.parse(calculated) > time.now().getTime() && scheduler.get("schedule-1")!.nextRun === calculated);
  check("calculateNextRun on manual is null", scheduler.calculateNextRun("schedule-2") === null);
  check("calculateNextRun unknown id rejected", throwsSchedule(() => scheduler.calculateNextRun("nope")));

  // Plan: read-only
  const planClock = clock(T0);
  const planner = createDiscoveryScheduler({ lookup: createScheduleSourceLookup(sources()), now: planClock.now });
  planner.createSchedule({ sourceId: "s1", frequency: "HOURLY", priority: "NORMAL" });
  planner.createSchedule({ sourceId: "s2", frequency: "HOURLY", priority: "CRITICAL", nextRun: "2026-01-01T02:00:00.000Z" });
  planner.createSchedule({ sourceId: "s3", frequency: "HOURLY", priority: "NORMAL", nextRun: "2026-01-01T00:30:00.000Z" });
  planner.createSchedule({ sourceId: "s1", frequency: "MANUAL" });
  check("nothing is due before nextRun", planner.plan().length === 0);
  planClock.advance(3 * HOUR);
  const before = JSON.stringify(planner.list());
  const plan = planner.plan();
  check("plan orders by priority then due time", plan.map((p) => p.scheduleId).join(",") === "schedule-2,schedule-3,schedule-1");
  check("plan skips MANUAL", !plan.some((p) => p.scheduleId === "schedule-4"));
  check("plan carries source, priority, dueAt", plan[0].sourceId === "s2" && plan[0].priority === "CRITICAL" && plan[0].dueAt === "2026-01-01T02:00:00.000Z");
  check("plan does not change schedules", JSON.stringify(planner.list()) === before);
  planner.pause("schedule-2");
  check("paused schedules are not planned", !planner.plan().some((p) => p.scheduleId === "schedule-2"));
  planner.disable("schedule-3");
  check("disabled schedules are not planned", !planner.plan().some((p) => p.scheduleId === "schedule-3"));

  // Statistics
  const stats = planner.statistics();
  check("stats status counts", stats.total === 4 && stats.active === 2 && stats.paused === 1 && stats.disabled === 1 && stats.error === 0);
  check("stats nextExecution is the earliest ACTIVE nextRun", stats.nextExecution === "2026-01-01T01:00:00.000Z");
  check("stats average interval ignores manual", stats.averageIntervalMs === HOUR);
  check("stats lastExecution is null with no runs", stats.lastExecution === null);
  const mixed = computeScheduleStatistics([
    { status: "ACTIVE", frequency: "DAILY", intervalMinutes: null, nextRun: "2026-01-02T00:00:00.000Z", lastRun: "2026-01-01T00:00:00.000Z" },
    { status: "ACTIVE", frequency: "HOURLY", intervalMinutes: null, nextRun: "2026-01-01T05:00:00.000Z", lastRun: "2026-01-01T04:00:00.000Z" },
    { status: "PAUSED", frequency: "CUSTOM", intervalMinutes: 60, nextRun: "2026-01-01T01:00:00.000Z", lastRun: "2025-12-31T00:00:00.000Z" },
  ]);
  check("stats lastExecution is the latest lastRun", mixed.lastExecution === "2026-01-01T04:00:00.000Z");
  check("stats ignore paused nextRun", mixed.nextExecution === "2026-01-01T05:00:00.000Z");
  check("stats average interval", mixed.averageIntervalMs === (24 * HOUR + HOUR + HOUR) / 3);
  check("empty stats", computeScheduleStatistics([]).averageIntervalMs === null && computeScheduleStatistics([]).nextExecution === null);

  // Delete
  check("delete returns the schedule", planner.deleteSchedule("schedule-4").id === "schedule-4" && planner.get("schedule-4") === null);
  check("delete unknown rejected", throwsSchedule(() => planner.deleteSchedule("schedule-4")));
  check("deleted schedule can be recreated", planner.createSchedule({ sourceId: "s1", frequency: "MANUAL" }).id === "schedule-5");
  check("list filters", planner.list({ status: "PAUSED" }).length === 1 && planner.list({ frequency: "MANUAL" }).length === 1 && planner.list({ sourceId: "s2" }).length === 1 && planner.list({ enabled: false }).length === 1);

  // Registry in isolation
  const store = createScheduleRegistry();
  store.insert(planner.get("schedule-1")!);
  check("registry rejects a taken id", (() => { try { store.insert(planner.get("schedule-1")!); return false; } catch { return true; } })());
  check("registry replace unknown throws", (() => { try { store.replace({ ...planner.get("schedule-1")!, id: "zz" }); return false; } catch { return true; } })());
  check("registry remove unknown is null", store.remove("zz") === null);

  // Events: definitions only
  const event: DiscoveryScheduleEvent = { type: "ScheduleCreated", at: T0, scheduleId: "s", sourceId: "x" };
  check("five event types defined", DISCOVERY_SCHEDULE_EVENT_TYPES.join(",") === "ScheduleCreated,ScheduleUpdated,SchedulePaused,ScheduleResumed,ScheduleDeleted" && event.type === "ScheduleCreated");

  // Isolation
  const dir = join(__dirname, "..", "src", "lib", "discovery");
  const text = readdirSync(dir).map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  check("no http, sql, models, timers, workers, or cron", !/fetch\(|node:http|getDb|better-sqlite3|anthropic|openai|setInterval|setTimeout|worker_threads|child_process|node-cron|CronJob/i.test(text));
  check("no imports outside the discovery module", !/from\s+"(?!\.\/)[^"]*"/.test(text));
  const schedulerText = readFileSync(join(dir, "discovery-scheduler.ts"), "utf8");
  check("scheduler never touches the queue", !/discovery-queue/.test(schedulerText));
  check("events file has no emitter", !/EventEmitter|\.emit\(|\.on\(|addEventListener/.test(readFileSync(join(dir, "discovery-schedule-events.ts"), "utf8")));

  console.log(failures === 0 ? "DISCOVERY_SCHEDULER_TESTS=PASS" : `DISCOVERY_SCHEDULER_TESTS=FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
