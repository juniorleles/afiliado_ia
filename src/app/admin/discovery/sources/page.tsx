import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { parseSourceQuery, searchSources, sourceActions, toSourceRow } from "@/lib/discovery/discovery-admin";
import { getDiscoveryRuntime } from "@/lib/discovery/discovery-runtime";
import { DISCOVERY_SOURCE_STATUSES, DISCOVERY_TYPES } from "@/lib/discovery/discovery-types";
import { toggleSourceAction } from "../actions";
import { EmptyState, ErrorNotice, Pill, SectionTitle, buttonClass, sourceStatusTone, tableClass, tdClass, thClass } from "../ui";

export default async function DiscoverySourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = parseSourceQuery(params);
  const all = getDiscoveryRuntime().registry.list();
  const rows = searchSources(all, query).map(toSourceRow);
  const filtered = query.q !== "" || query.type !== null || query.status !== null;

  const active = new URLSearchParams();
  if (query.q) active.set("q", query.q);
  if (query.type) active.set("type", query.type);
  if (query.status) active.set("status", query.status);
  if (query.sort !== "priority") active.set("sort", query.sort);
  const returnTo = `/admin/discovery/sources${active.size ? `?${active}` : ""}`;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="space-y-4">
      <SectionTitle note="Enable and disable change availability only. Nothing is executed.">Sources</SectionTitle>
      <ErrorNotice message={error} />

      <form method="get" action="/admin/discovery/sources" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Name, provider, or id"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-zinc-400">
          Type
          <select name="type" defaultValue={query.type ?? ""} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
            <option value="">All types</option>
            {DISCOVERY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-zinc-400">
          Status
          <select name="status" defaultValue={query.status ?? ""} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
            <option value="">All statuses</option>
            {DISCOVERY_SOURCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-zinc-400">
          Sort by
          <select name="sort" defaultValue={query.sort} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
            <option value="priority">Priority</option>
            <option value="name">Name</option>
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          Apply
        </button>
        <Link href="/admin/discovery/sources" className="text-zinc-400 hover:underline">
          Reset
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState>
          {all.length === 0
            ? "No discovery sources are registered yet. Sources are added by later setup steps; this screen never runs discovery."
            : "No sources match the current search and filters."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Provider</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Capabilities</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const source = all.find((candidate) => candidate.id === row.id)!;
                return (
                  <tr key={row.id}>
                    <td className={tdClass}>
                      <span className="font-medium text-zinc-100">{row.name}</span>
                      <span className="block text-xs text-zinc-500">{row.id}</span>
                    </td>
                    <td className={tdClass}>{row.provider}</td>
                    <td className={tdClass}>{row.type}</td>
                    <td className={tdClass}>{row.priority}</td>
                    <td className={tdClass}>
                      <Pill tone={sourceStatusTone(row.status)}>{row.status}</Pill>
                    </td>
                    <td className={tdClass}>{row.capabilities.length ? row.capabilities.join(", ") : "None"}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap items-center gap-2">
                        {sourceActions(source).map((op) => (
                          <form key={op} action={toggleSourceAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="op" value={op} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className={buttonClass}>
                              {op === "enable" ? "Enable" : "Disable"}
                            </button>
                          </form>
                        ))}
                        <Link href={`/admin/discovery/sources/${encodeURIComponent(row.id)}`} className="text-xs text-emerald-400 hover:underline">
                          View details
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        Showing {rows.length} of {all.length} source{all.length === 1 ? "" : "s"}
        {filtered ? " (filtered)" : ""}.
      </p>
    </div>
  );
}
