import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { buildDashboard, buildStatistics, formatDuration } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime, readDiscoveryState } from "@/lib/discovery/discovery-runtime";
import { LevelBadge, SectionTitle, Stat, formatTime } from "./ui";

export default async function DiscoveryDashboardPage() {
  await requireAdmin();
  const state = readDiscoveryState(getDiscoveryRuntime());
  const now = new Date();
  const dashboard = buildDashboard(state, now);
  const statistics = buildStatistics(state);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SectionTitle>Overall health</SectionTitle>
          <LevelBadge level={dashboard.health.overall} />
          <Link href="/admin/discovery/health" className="text-sm text-emerald-400 hover:underline">
            Health details
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle note="Counts come from the source registry.">Sources</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Registered sources" value={dashboard.registered} />
          <Stat label="Enabled sources" value={dashboard.enabled} />
          <Stat label="Disabled sources" value={dashboard.disabled} />
          <Stat label="Experimental sources" value={dashboard.experimental} />
          <Stat label="Deprecated sources" value={dashboard.deprecated} />
        </div>
        <Link href="/admin/discovery/sources" className="text-sm text-emerald-400 hover:underline">
          Open sources
        </Link>
      </section>

      <section className="space-y-3">
        <SectionTitle note="Read-only. Nothing processes the queue.">Queue summary</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Queued" value={dashboard.queue.queued} />
          <Stat label="Processing" value={dashboard.queue.processing} />
          <Stat label="Completed" value={dashboard.queue.completed} />
          <Stat label="Failed" value={dashboard.queue.failed} />
          <Stat label="Ignored" value={dashboard.queue.ignored} />
        </div>
        <Link href="/admin/discovery/queue" className="text-sm text-emerald-400 hover:underline">
          Open queue
        </Link>
      </section>

      <section className="space-y-3">
        <SectionTitle note="Planning only. Nothing executes schedules.">Scheduler summary</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Active schedules" value={dashboard.scheduler.active} />
          <Stat label="Paused schedules" value={dashboard.scheduler.paused} />
          <Stat label="Disabled schedules" value={dashboard.scheduler.disabled} />
          <Stat label="Next execution" value={<span className="text-base">{formatTime(dashboard.scheduler.nextExecution)}</span>} />
          <Stat label="Last execution" value={<span className="text-base">{formatTime(dashboard.scheduler.lastExecution)}</span>} />
        </div>
        <Link href="/admin/discovery/scheduler" className="text-sm text-emerald-400 hover:underline">
          Open scheduler
        </Link>
      </section>

      <section className="space-y-3">
        <SectionTitle>Statistics</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Registered sources" value={statistics.registeredSources} />
          <Stat label="Configured schedules" value={statistics.configuredSchedules} />
          <Stat label="Queue size" value={statistics.queueSize} />
          <Stat label="Average queue time" value={formatDuration(statistics.averageQueueTimeMs)} />
          <Stat
            label="Discovery capacity"
            value={statistics.capacity.automatedSources}
            hint={`automated sources · ${statistics.capacity.schedulableSources} schedulable`}
          />
          <Stat label="System version" value={<span className="text-base">{statistics.systemVersion}</span>} />
        </div>
      </section>
    </div>
  );
}
