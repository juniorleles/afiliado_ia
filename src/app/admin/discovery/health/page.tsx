import { requireAdmin } from "@/lib/admin-auth";
import { buildHealth, type DiscoveryHealthIssue } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime, readDiscoveryState } from "@/lib/discovery/discovery-runtime";
import { EmptyState, LevelBadge, SectionTitle } from "../ui";

function IssueList({ issues, tone }: { issues: DiscoveryHealthIssue[]; tone: string }) {
  return (
    <ul className={`space-y-1 text-sm ${tone}`}>
      {issues.map((issue, index) => (
        <li key={`${issue.scope}-${issue.subject}-${index}`}>
          <span className="uppercase text-zinc-500">{issue.scope}</span>
          {issue.subject ? <span className="text-zinc-500"> · {issue.subject}</span> : null} — {issue.message}
        </li>
      ))}
    </ul>
  );
}

export default async function DiscoveryHealthPage() {
  await requireAdmin();
  const health = buildHealth(readDiscoveryState(getDiscoveryRuntime()), new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle>Health</SectionTitle>
        <LevelBadge level={health.overall} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(
          [
            ["Registry health", health.registry],
            ["Queue health", health.queue],
            ["Scheduler health", health.scheduler],
          ] as const
        ).map(([label, level]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
            <div className="mt-2">
              <LevelBadge level={level} />
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <SectionTitle>Configuration warnings</SectionTitle>
        {health.warnings.length === 0 ? (
          <EmptyState>No configuration warnings.</EmptyState>
        ) : (
          <IssueList issues={health.warnings} tone="text-amber-300" />
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Validation errors</SectionTitle>
        {health.errors.length === 0 ? (
          <EmptyState>No validation errors.</EmptyState>
        ) : (
          <IssueList issues={health.errors} tone="text-red-300" />
        )}
      </section>
    </div>
  );
}
