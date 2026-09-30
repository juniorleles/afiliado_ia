import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById } from "@/lib/campaigns";
import { formatCtr, parseAnalyticsRange, type AnalyticsRange } from "@/lib/analytics";
import { getCampaignAnalytics } from "@/lib/analytics-store";
import { formatUsdCents } from "@/lib/clickbank";

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
};

export default async function CampaignAnalyticsPage({ params, searchParams }: Props) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();

  const campaign = getCampaignById(id);
  if (!campaign) notFound();

  const { range: rawRange } = await searchParams;
  const range = parseAnalyticsRange(rawRange);
  const stats = getCampaignAnalytics(campaign.id, range);
  const published = campaign.publicationStatus === "published";
  const commerce = stats.commerce;

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
        First-party funnel
      </p>
      <h2 className="text-xl font-medium">{campaign.name}</h2>
      <p className="font-mono text-sm text-zinc-500">/p/{campaign.slug}</p>
      <p className="text-xs uppercase tracking-wide text-zinc-400">
        Publication: {published ? "PUBLISHED" : "DRAFT"}
      </p>
      <p className="text-sm text-zinc-400">
        Visits and sessions do not necessarily represent individual humans.
        Affiliate commission is the USD amount ClickBank reported in
        totalAccountAmount — not ads spend, not marketplace
        &quot;revenue&quot;, and not a cost-based return metric.
      </p>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((item) => (
          <Link
            key={item.id}
            href={`/admin/${campaign.id}/analytics?range=${item.id}`}
            className={`rounded-md px-3 py-1 text-sm ${
              range === item.id
                ? "bg-emerald-500 text-zinc-950"
                : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Visits (page views)" value={String(stats.visits)} />
        <Stat label="Unique sessions" value={String(stats.uniqueSessions)} />
        <Stat label="CTA click events" value={String(stats.ctaEvents)} />
        <Stat label="CTA sessions" value={String(stats.ctaSessions)} />
        <Stat label="Presell CTR" value={formatCtr(stats.ctr)} hint="CTA sessions / unique presell sessions" />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">CTA breakdown</h3>
        <table className="w-full text-left text-sm text-zinc-300">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1 font-medium">Position</th>
              <th className="py-1 font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="py-1">Header</td><td>{stats.byPosition.header}</td></tr>
            <tr><td className="py-1">Hero</td><td>{stats.byPosition.hero}</td></tr>
            <tr><td className="py-1">Middle</td><td>{stats.byPosition.middle}</td></tr>
            <tr><td className="py-1">Final</td><td>{stats.byPosition.final}</td></tr>
            <tr><td className="py-1">Guarantee</td><td>{stats.byPosition.guarantee}</td></tr>
            <tr><td className="py-1">Sticky</td><td>{stats.byPosition.sticky}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">utm_source</h3>
        <Breakdown rows={stats.utmSource} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">utm_medium</h3>
        <Breakdown rows={stats.utmMedium} />
      </section>

      <p className="text-sm text-zinc-300">
        Google Ads identifiers present (gclid sessions): {stats.gclidSessions}
      </p>

      <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-200">ClickBank</h3>
        <p className="text-sm text-zinc-400">
          {commerce.insConfigured
            ? "INS v8 endpoint is configured. HopLink tracking uses official extclid."
            : "INS secret is not configured. Set CLICKBANK_INS_SECRET and register /api/clickbank/ins in ClickBank (version 8)."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Sales" value={String(commerce.sales)} hint="ATTRIBUTED SALE notifications for this campaign" />
          <Stat label="Refunds" value={String(commerce.refunds)} hint="ATTRIBUTED RFND notifications for this campaign" />
          <Stat label="Gross affiliate commission" value={formatUsdCents(commerce.grossCommissionCents)} hint="USD as reported by ClickBank" />
          <Stat label="Refunded commission" value={formatUsdCents(commerce.refundedCommissionCents)} hint="RFND + CGBK + INSF (absolute)" />
          <Stat label="Net affiliate commission" value={formatUsdCents(commerce.netCommissionCents)} hint="Gross minus refunds/chargebacks" />
          <Stat
            label="CTA → Sale"
            value={formatCtr(commerce.ctaToSaleRate)}
            hint="Attributed SALE count / CTA sessions in this range"
          />
          <Stat label="Attributed sales" value={String(commerce.attributedSales)} />
          <Stat
            label="Unattributed sales"
            value={String(commerce.unattributedSalesSitewide)}
            hint="Site-wide SALE rows with no matching clickId — not assigned to this campaign"
          />
        </div>
        {commerce.rebills > 0 || commerce.chargebacks > 0 ? (
          <p className="text-xs text-zinc-500">
            Rebills (BILL): {commerce.rebills}. Chargebacks (CGBK/INSF): {commerce.chargebacks}.
          </p>
        ) : null}
        <p className="text-xs text-zinc-500">
          An unattributed sale is a real transaction whose originating Presell
          OS click could not be established. Ads spend is not connected, so
          cost-based return metrics are not shown.
        </p>
        <Link href="/admin/transactions" className="inline-block text-sm text-emerald-400 hover:underline">
          Inspect transactions
        </Link>
      </section>

      <Link href="/admin" className="inline-block text-sm text-zinc-400 hover:underline">
        ← Voltar
      </Link>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Breakdown({ rows }: { rows: Array<{ key: string; sessions: number }> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No sessions in this range.</p>;
  }
  return (
    <table className="w-full text-left text-sm text-zinc-300">
      <thead>
        <tr className="text-zinc-500">
          <th className="py-1 font-medium">Value</th>
          <th className="py-1 font-medium">Sessions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="py-1 font-mono text-xs">{row.key}</td>
            <td className="py-1">{row.sessions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
