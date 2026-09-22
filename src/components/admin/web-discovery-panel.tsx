import type { ProductFacts } from "@/lib/product-facts";
import {
  ALTERNATIVE_SOURCES_FOUND_MESSAGE,
  NO_VERIFIED_SOURCES_MESSAGE,
  SEARCH_NOT_CONFIGURED_MESSAGE,
  SEARCH_PROVIDER_TIMED_OUT_MESSAGE,
  SOURCE_DISCOVERY_TIMED_OUT_MESSAGE,
} from "@/lib/source-resolution/block";

export function WebDiscoveryPanel({ facts }: { facts: ProductFacts }) {
  const report = facts.webDiscovery;
  if (!report?.triggered) return null;
  const outcome =
    report.outcome === "SEARCH_NOT_CONFIGURED"
      ? SEARCH_NOT_CONFIGURED_MESSAGE
      : report.outcome === "SEARCH_TIMEOUT"
        ? SEARCH_PROVIDER_TIMED_OUT_MESSAGE
        : report.outcome === "TIMED_OUT" || report.outcome === "CANCELLED"
          ? SOURCE_DISCOVERY_TIMED_OUT_MESSAGE
        : report.acceptedCount > 0
          ? ALTERNATIVE_SOURCES_FOUND_MESSAGE
          : NO_VERIFIED_SOURCES_MESSAGE;
  const messages = report.operatorMessages?.length ? report.operatorMessages : [report.message, outcome];
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-3 text-sm text-amber-100">
      <ol className="space-y-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-amber-200/80">
        Original URL was not bypassed ({report.primaryBlock || "blocked"}). Search results are not trusted until
        product identity is confirmed. Uncertain sources are excluded from grounded facts.
      </p>
      {report.searchProvider ? (
        <p className="mt-2 text-xs text-zinc-400">
          Search provider: {report.searchProvider.name}
          {report.searchProvider.configured ? "" : " · not configured"}
          {report.searchProvider.missingConfig?.length
            ? ` · missing ${report.searchProvider.missingConfig.join(", ")}`
            : ""}
        </p>
      ) : null}
      {report.queriesUsed.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">Queries: {report.queriesUsed.join(" → ")}</p>
      ) : null}
      {report.phases && report.phases.length > 0 ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-500">
          {report.phases.map((phase) => phase.phase).join(" → ")}
        </p>
      ) : null}
      <ul className="mt-2 space-y-1 text-xs">
        {report.sources.map((source) => (
          <li key={source.url}>
            <span className="font-mono uppercase">{source.status}</span>
            {" · "}
            {source.title || source.url}
            {source.identityReasons.length > 0 ? ` — ${source.identityReasons.join("; ")}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-400">
        Accepted {report.acceptedCount} · Identity uncertain {report.uncertainCount}
      </p>
    </div>
  );
}
