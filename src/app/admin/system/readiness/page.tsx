import { productionReadiness } from "@/lib/readiness";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function ReadinessPage() {
  await requireAdmin();
  const report = productionReadiness();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Production readiness</h2>
      <p className="text-sm text-zinc-400">Operational diagnostic. Secrets are never shown.</p>
      <dl className="grid gap-2 text-sm">
        {Object.entries(report).map(([key, value]) => (
          <div key={key} className="flex justify-between rounded-md border border-zinc-800 px-3 py-2">
            <dt className="font-mono text-zinc-400">{key}</dt>
            <dd className="font-medium text-zinc-100">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
