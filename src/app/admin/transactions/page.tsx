import Link from "next/link";
import { formatUsdCents } from "@/lib/clickbank";
import { listAffiliateTransactions } from "@/lib/clickbank-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminTransactionsPage() {
  const rows = listAffiliateTransactions(200);

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
        ClickBank INS
      </p>
      <h2 className="text-xl font-medium">Transactions</h2>
      <p className="text-sm text-zinc-400">
        Attribution debugging. An unattributed sale is a real transaction
        whose originating Presell OS click could not be established.
        Buyer name, email, and address are not stored.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-zinc-400">
          No ClickBank notifications stored yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Transaction ID</th>
                <th className="py-2 pr-3 font-medium">Commission</th>
                <th className="py-2 pr-3 font-medium">Currency</th>
                <th className="py-2 font-medium">Attribution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-3 font-mono text-xs">{row.occurredAt}</td>
                  <td className="py-2 pr-3">
                    {row.campaignId ? (
                      <Link
                        href={`/admin/${row.campaignId}/analytics`}
                        className="text-emerald-400 hover:underline"
                      >
                        {row.campaignName ?? `#${row.campaignId}`}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.transactionType}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.externalTransactionId}</td>
                  <td className="py-2 pr-3">{formatUsdCents(row.affiliateCommissionCents)}</td>
                  <td className="py-2 pr-3">{row.currency}</td>
                  <td className="py-2 text-xs">{row.attributionStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link href="/admin" className="inline-block text-sm text-zinc-400 hover:underline">
        ← Voltar
      </Link>
    </div>
  );
}
