import { requireAdmin } from "@/lib/admin-auth";
import { buildQueuePanel, formatDuration } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime, readDiscoveryState } from "@/lib/discovery/discovery-runtime";
import { EmptyState, Pill, SectionTitle, Stat, formatTime, tableClass, tdClass, thClass } from "../ui";

export default async function DiscoveryQueuePage() {
  await requireAdmin();
  const panel = buildQueuePanel(readDiscoveryState(getDiscoveryRuntime()));
  const { statistics } = panel;

  return (
    <div className="space-y-6">
      <SectionTitle note="Read-only. Nothing here changes or processes queue items.">Queue</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Queued" value={statistics.queued} />
        <Stat label="Processing" value={statistics.processing} />
        <Stat label="Completed" value={statistics.completed} />
        <Stat label="Failed" value={statistics.failed} />
        <Stat label="Ignored" value={statistics.ignored} />
        <Stat label="Cancelled" value={panel.cancelled} />
        <Stat label="Average wait" value={formatDuration(statistics.averageWaitMs)} />
        <Stat label="Average processing" value={formatDuration(statistics.averageProcessingMs)} />
      </div>

      {panel.items.length === 0 ? (
        <EmptyState>The queue is empty. Items arrive only when discovered candidates are enqueued.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Item</th>
                <th className={thClass}>Candidate</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Attempts</th>
                <th className={thClass}>Created</th>
                <th className={thClass}>Error</th>
              </tr>
            </thead>
            <tbody>
              {panel.items.map((item) => (
                <tr key={item.id}>
                  <td className={tdClass}>{item.id}</td>
                  <td className={tdClass}>{item.candidateId}</td>
                  <td className={tdClass}>{item.sourceId}</td>
                  <td className={tdClass}>{item.priority}</td>
                  <td className={tdClass}>
                    <Pill tone={item.status === "FAILED" ? "bad" : item.status === "COMPLETED" ? "good" : "neutral"}>{item.status}</Pill>
                  </td>
                  <td className={tdClass}>{item.attempts}</td>
                  <td className={tdClass}>{formatTime(item.createdAt)}</td>
                  <td className={tdClass}>{item.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {panel.hidden > 0 ? <p className="text-xs text-zinc-500">{panel.hidden} more item(s) not shown.</p> : null}
    </div>
  );
}
