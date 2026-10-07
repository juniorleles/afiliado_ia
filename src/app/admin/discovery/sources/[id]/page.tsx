import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { sourceActions, sourceCapabilities } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime } from "@/lib/discovery/discovery-runtime";
import { validateDiscoverySource } from "@/lib/discovery/discovery-sources";
import { toggleSourceAction } from "../../actions";
import { ErrorNotice, Pill, SectionTitle, buttonClass, formatTime, scheduleStatusTone, sourceStatusTone } from "../../ui";

export default async function DiscoverySourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const runtime = getDiscoveryRuntime();
  const source = runtime.registry.get(id);
  if (!source) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : undefined;
  const schedules = runtime.scheduler.list({ sourceId: source.id });
  const queued = runtime.queue.list({ sourceId: source.id });
  const issues = validateDiscoverySource(source);
  const returnTo = `/admin/discovery/sources/${encodeURIComponent(source.id)}`;

  const fields: Array<[string, string]> = [
    ["Id", source.id],
    ["Provider", source.provider],
    ["Category", source.category],
    ["Discovery type", source.discoveryType],
    ["Priority", String(source.priority)],
    ["Enabled", source.enabled ? "Yes" : "No"],
    ["API", source.supportsApi ? "Yes" : "No"],
    ["Crawler", source.supportsCrawler ? "Yes" : "No"],
    ["Search", source.supportsSearch ? "Yes" : "No"],
    ["Pagination", source.supportsPagination ? "Yes" : "No"],
    ["Scheduling", source.supportsScheduling ? "Yes" : "No"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-semibold">{source.name}</h3>
          <Pill tone={sourceStatusTone(source.status)}>{source.status}</Pill>
        </div>
        <div className="flex items-center gap-3">
          {sourceActions(source).map((op) => (
            <form key={op} action={toggleSourceAction}>
              <input type="hidden" name="id" value={source.id} />
              <input type="hidden" name="op" value={op} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" className={buttonClass}>
                {op === "enable" ? "Enable" : "Disable"}
              </button>
            </form>
          ))}
          <Link href="/admin/discovery/sources" className="text-sm text-emerald-400 hover:underline">
            All sources
          </Link>
        </div>
      </div>
      <ErrorNotice message={error} />

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded border border-zinc-800 p-3">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="mt-1 text-sm text-zinc-200">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-zinc-400">Capabilities: {sourceCapabilities(source).join(", ") || "None"}</p>

      <section className="space-y-2">
        <SectionTitle>Validation</SectionTitle>
        {issues.length === 0 ? (
          <p className="text-sm text-emerald-300">This source passes validation.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-300">
            {issues.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>
                {issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Schedules for this source</SectionTitle>
        {schedules.length === 0 ? (
          <p className="text-sm text-zinc-400">No schedules.</p>
        ) : (
          <ul className="space-y-1 text-sm text-zinc-300">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="flex flex-wrap items-center gap-2">
                <span>{schedule.id}</span>
                <span>{schedule.frequency}</span>
                <Pill tone={scheduleStatusTone(schedule.status)}>{schedule.status}</Pill>
                <span className="text-zinc-500">next {formatTime(schedule.nextRun)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-zinc-400">
        Queue items from this source: {queued.length}. Viewing details never runs discovery.
      </p>
    </div>
  );
}
