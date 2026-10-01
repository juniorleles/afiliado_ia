import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { buildSchedulerPanel } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime, readDiscoveryState } from "@/lib/discovery/discovery-runtime";
import { scheduleControlAction } from "../actions";
import { EmptyState, ErrorNotice, Pill, SectionTitle, Stat, buttonClass, formatTime, scheduleStatusTone, tableClass, tdClass, thClass } from "../ui";

const LABEL = { pause: "Pause", resume: "Resume", enable: "Enable", disable: "Disable" } as const;

export default async function DiscoverySchedulerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const panel = buildSchedulerPanel(readDiscoveryState(getDiscoveryRuntime()), new Date());

  return (
    <div className="space-y-6">
      <SectionTitle note="Planning only. Controls change schedule state; nothing is executed.">Scheduler</SectionTitle>
      <ErrorNotice message={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active" value={panel.statistics.active} />
        <Stat label="Paused" value={panel.statistics.paused} />
        <Stat label="Disabled" value={panel.statistics.disabled} />
        <Stat label="Due now" value={panel.dueCount} hint="planned, not running" />
      </div>

      {panel.rows.length === 0 ? (
        <EmptyState>No schedules are configured. Schedules are created by later setup steps.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Schedule</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>Frequency</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Next run</th>
                <th className={thClass}>Last run</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {panel.rows.map((row) => (
                <tr key={row.id}>
                  <td className={tdClass}>{row.id}</td>
                  <td className={tdClass}>
                    {row.sourceName ? (
                      <Link href={`/admin/discovery/sources/${encodeURIComponent(row.sourceId)}`} className="text-emerald-400 hover:underline">
                        {row.sourceName}
                      </Link>
                    ) : (
                      <span className="text-red-300">{row.sourceId} (missing)</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    {row.frequency}
                    <span className="block text-xs text-zinc-500">{row.timezone}</span>
                  </td>
                  <td className={tdClass}>
                    <Pill tone={scheduleStatusTone(row.status)}>{row.status}</Pill>
                  </td>
                  <td className={tdClass}>{formatTime(row.nextRun)}</td>
                  <td className={tdClass}>{formatTime(row.lastRun)}</td>
                  <td className={tdClass}>{row.priority}</td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-2">
                      {row.actions.map((op) => (
                        <form key={op} action={scheduleControlAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="op" value={op} />
                          <input type="hidden" name="returnTo" value="/admin/discovery/scheduler" />
                          <button type="submit" className={buttonClass}>
                            {LABEL[op]}
                          </button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
