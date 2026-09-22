import type { MarketResearchReport } from "@/lib/market-research/types";
import type { StrategyRecommendation } from "@/lib/strategy/types";
import { uniqueIntentKinds } from "@/lib/market-research/signals";

export function MarketRecommendationPanel({
  recommendation,
  research,
  onGenerate,
  onAlternatives,
  onRefresh,
  generating,
}: {
  recommendation: StrategyRecommendation;
  research: MarketResearchReport;
  onGenerate: () => void;
  onAlternatives: () => void;
  onRefresh?: () => void;
  generating?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-md border border-emerald-800 bg-emerald-950/20 p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">AI market recommendation</p>
      <p className="text-sm text-zinc-400">
        Most appropriate based on current market evidence — not a guaranteed best-converting variant.
      </p>
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Recommended approach</dt>
          <dd className="text-lg font-semibold text-zinc-50">{recommendation.recommendedStrategy}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Strategy confidence</dt>
          <dd className="text-lg font-semibold text-zinc-50">{recommendation.confidence}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Research quality</dt>
          <dd className="text-lg font-semibold text-zinc-50">{research.quality}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Unique domains</dt>
          <dd>{research.diversity?.UNIQUE_DOMAINS ?? "—"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Why this approach</dt>
          <dd className="mt-1 text-zinc-200">{recommendation.rationale}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Current market signals</dt>
          <dd>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-300">
              {recommendation.marketSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Usable sources</dt>
          <dd>{research.diversity?.USABLE_SOURCES ?? research.sources.length}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Research date/time</dt>
          <dd className="font-mono text-xs">{research.researchedAt}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Research status</dt>
          <dd>{research.status}</dd>
        </div>
      </dl>
      {recommendation.risks.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-200">
          {recommendation.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      ) : null}
      {(recommendation.evidenceTrace || []).length > 0 ? (
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Evidence trace</dt>
          <ul className="mt-1 space-y-1 font-mono text-[11px] text-zinc-500">
            {recommendation.evidenceTrace.slice(0, 12).map((item, index) => (
              <li key={`${item.signal}:${item.sourceUrl || item.evidence}:${index}`}>
                {item.signal} · {item.sourceType}
                {item.queryFamily ? ` · ${item.queryFamily}` : ""}
                {item.sourceUrl ? ` · ${item.sourceUrl}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
        >
          {generating ? "Generating recommended LP…" : "GENERATE RECOMMENDED LP"}
        </button>
        <button
          type="button"
          onClick={onAlternatives}
          className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200"
        >
          View alternative strategies
        </button>
        {research.status === "STALE" && onRefresh ? (
          <button type="button" onClick={onRefresh} className="rounded-md border border-amber-600 px-4 py-2 text-sm text-amber-100">
            Refresh market research
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MarketResearchPanel({ research }: { research: MarketResearchReport }) {
  const families = research.queryFamilies || [];
  const intents = uniqueIntentKinds(research.signals.observedIntents || []);
  const diversity = research.diversity;
  const sourceClasses = diversity?.SOURCE_CLASSES || [...new Set(research.sources.map((source) => source.classification))];
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
      <p className="text-xs uppercase tracking-wide text-emerald-400">View market research</p>
        <p className="mt-1 text-xs text-zinc-500">
          Search provider: {research.searchProvider.name}
          {research.searchProvider.fallbackConfigured ? " · Brave fallback on DDG infrastructure failure" : ""}
          {research.searchProvider.realWebSearchAvailable ? "" : " · unavailable"}
        </p>
        {research.providerMix ? (
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            DDG_QUERY_SUCCESS={research.providerMix.DDG_QUERY_SUCCESS} · BRAVE_FALLBACK_ATTEMPTS=
            {research.providerMix.BRAVE_FALLBACK_ATTEMPTS} · BRAVE_FALLBACK_SUCCESS={research.providerMix.BRAVE_FALLBACK_SUCCESS} ·
            BRAVE_FALLBACK_FAILED={research.providerMix.BRAVE_FALLBACK_FAILED}
          </p>
        ) : null}

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Query outcomes</h3>
        {(research.queryOutcomes || []).length === 0 ? (
          <p className="text-xs text-zinc-500">No query outcomes recorded.</p>
        ) : (
          <ul className="space-y-1 font-mono text-[11px] text-zinc-400">
            {(research.queryOutcomes || []).map((row) => (
              <li key={`${row.family}:${row.query}`}>
                {row.family} · {row.query} · {row.status} · {row.providerUsed || "—"} · {row.durationMs}ms · raw={row.rawHits} · usable={row.usableHits}
                {(row.providerAttempts || []).length
                  ? ` · attempts: ${row.providerAttempts.map((attempt) => `${attempt.provider}=${attempt.status}`).join(" → ")}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Query families</h3>
        {families.length === 0 ? (
          <p className="text-xs text-zinc-500">No query families recorded.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {families.map((family) => (
              <li key={family.family}>
                <span className="font-mono text-amber-200">{family.family}</span>
                <span className="mt-0.5 block text-zinc-400">{family.queries.join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Market signals</h3>
        <p className="text-xs text-zinc-300">{intents.length ? intents.join(", ") : "No independent intent signals."}</p>
        {research.signals.commonQuestions.length ? (
          <p className="text-xs text-zinc-500">Questions: {research.signals.commonQuestions.slice(0, 4).join(" | ")}</p>
        ) : null}
        {research.signals.purchaseConsiderations.length ? (
          <p className="text-xs text-zinc-500">
            Purchase considerations: {research.signals.purchaseConsiderations.slice(0, 4).join(" | ")}
          </p>
        ) : null}
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Source mix</h3>
        <p className="text-xs text-zinc-300">{sourceClasses.join(", ") || "none"}</p>
        <p className="text-xs text-zinc-500">
          UNIQUE_DOMAINS={diversity?.UNIQUE_DOMAINS ?? 0} · PROMOTIONAL_SOURCES={diversity?.PROMOTIONAL_SOURCES ?? 0} ·
          PROMOTIONAL_PATTERN_DETECTED={String(Boolean(diversity?.PROMOTIONAL_PATTERN_DETECTED))}
        </p>
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Research quality</h3>
        <p className="text-sm font-semibold text-zinc-100">{research.quality}</p>
        <p className="text-xs text-zinc-500">Separate from strategy confidence. Promotional Official titles are not brand evidence.</p>
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Sources</h3>
        <ul className="space-y-2 text-xs">
          {research.sources.map((source) => (
            <li key={source.url}>
              <span className="font-mono uppercase text-amber-200">{source.classification}</span>
              {" · "}
              <span className="font-mono text-zinc-400">{source.domain || "unknown-domain"}</span>
              {source.path ? <span className="font-mono text-zinc-600"> {source.path}</span> : null}
              {" · "}
              {source.title}
              {source.classificationReason ? (
                <span className="mt-0.5 block text-zinc-600">reason: {source.classificationReason}</span>
              ) : null}
              <span className="mt-0.5 block text-zinc-500">{source.relevantEvidence}</span>
              <span className="block text-zinc-500">query: {source.query}</span>
              {source.discoveredByProvider ? (
                <span className="block text-zinc-600">provider: {source.discoveredByProvider}</span>
              ) : null}
              <span className="block font-mono text-[11px] text-zinc-600">{source.url}</span>
            </li>
          ))}
        </ul>
      </section>
      {research.discardedFabrications.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          Discarded fabricated-looking metric snippets: {research.discardedFabrications.length}
        </p>
      ) : null}
    </div>
  );
}
