import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDiscoveryRegistry, DiscoverySourceRegistryError } from "../src/lib/discovery/discovery-registry";
import { validateDiscoverySource } from "../src/lib/discovery/discovery-sources";
import type { DiscoverySource } from "../src/lib/discovery/discovery-types";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function source(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "alpha-feed",
    name: "Alpha Feed",
    provider: "Fictional Provider",
    category: "AFFILIATE_MARKETPLACE",
    enabled: true,
    priority: 50,
    discoveryType: "API",
    supportsApi: true,
    supportsCrawler: false,
    supportsSearch: false,
    supportsPagination: true,
    supportsScheduling: true,
    status: "ACTIVE",
    ...overrides,
  };
}

function throwsRegistry(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof DiscoverySourceRegistryError;
  }
}

function main() {
  const registry = createDiscoveryRegistry();

  check("valid source has no issues", validateDiscoverySource(source()).length === 0);
  check("registers and returns a copy", registry.register(source()).id === "alpha-feed");
  check("get returns the source", registry.get("alpha-feed")?.name === "Alpha Feed");
  check("get unknown is null", registry.get("missing") === null);
  check("duplicate id rejected", throwsRegistry(() => registry.register(source())));

  const mutated = registry.get("alpha-feed")!;
  mutated.priority = 1;
  check("stored source is isolated from caller copies", registry.get("alpha-feed")!.priority === 50);

  // Validation
  check("bad id rejected", validateDiscoverySource(source({ id: "Bad Id" })).some((i) => i.field === "id"));
  check("empty name rejected", validateDiscoverySource(source({ name: " " })).some((i) => i.field === "name"));
  check("empty provider rejected", validateDiscoverySource(source({ provider: "" })).some((i) => i.field === "provider"));
  check(
    "unknown category rejected",
    validateDiscoverySource({ ...source(), category: "OTHER" }).some((i) => i.field === "category"),
  );
  check(
    "unknown discovery type rejected",
    validateDiscoverySource({ ...source(), discoveryType: "RSS" }).some((i) => i.field === "discoveryType"),
  );
  check(
    "unknown status rejected",
    validateDiscoverySource({ ...source(), status: "PAUSED" }).some((i) => i.field === "status"),
  );
  check("priority above range rejected", validateDiscoverySource(source({ priority: 1001 })).length > 0);
  check("fractional priority rejected", validateDiscoverySource(source({ priority: 1.5 })).length > 0);
  check("negative priority rejected", validateDiscoverySource(source({ priority: -1 })).length > 0);
  check(
    "non-boolean flag rejected",
    validateDiscoverySource({ ...source(), supportsApi: "yes" }).some((i) => i.field === "supportsApi"),
  );
  check("non-object rejected", validateDiscoverySource(null).length > 0);
  check("API type requires supportsApi", validateDiscoverySource(source({ supportsApi: false, supportsPagination: false })).length > 0);
  check(
    "CRAWLER type requires supportsCrawler",
    validateDiscoverySource(source({ discoveryType: "CRAWLER", supportsApi: false, supportsPagination: false })).length > 0,
  );
  check(
    "SEARCH type requires supportsSearch",
    validateDiscoverySource(source({ discoveryType: "SEARCH", supportsApi: false, supportsPagination: false })).length > 0,
  );
  check(
    "MANUAL source with automation rejected",
    validateDiscoverySource(source({ discoveryType: "MANUAL", supportsApi: true })).length > 0,
  );
  check(
    "valid MANUAL source accepted",
    validateDiscoverySource(
      source({
        id: "manual-entry",
        discoveryType: "MANUAL",
        supportsApi: false,
        supportsPagination: false,
        supportsScheduling: false,
      }),
    ).length === 0,
  );
  check(
    "pagination without access mode rejected",
    validateDiscoverySource(
      source({ discoveryType: "PLUGIN", supportsApi: false, supportsPagination: true }),
    ).length > 0,
  );
  check("enabled must match status", validateDiscoverySource(source({ enabled: false })).length > 0);
  check("invalid source cannot register", throwsRegistry(() => registry.register(source({ id: "BAD" }))));

  // Enable / disable
  const disabled = registry.disable("alpha-feed");
  check("disable sets enabled=false and DISABLED", !disabled.enabled && disabled.status === "DISABLED");
  check("disabled state persists in registry", registry.get("alpha-feed")!.status === "DISABLED");
  const enabled = registry.enable("alpha-feed");
  check("enable restores ACTIVE", enabled.enabled && enabled.status === "ACTIVE");
  check("registry keeps enabled/status consistent", validateDiscoverySource(registry.get("alpha-feed")).length === 0);
  check("enable unknown id throws", throwsRegistry(() => registry.enable("missing")));
  check("disable unknown id throws", throwsRegistry(() => registry.disable("missing")));

  registry.register(
    source({ id: "beta-lab", name: "Beta Lab", status: "EXPERIMENTAL", category: "SEARCH_ENGINE", discoveryType: "SEARCH", supportsApi: false, supportsSearch: true, priority: 80 }),
  );
  check("experimental source stays enabled", registry.get("beta-lab")!.enabled);
  check("enabling experimental keeps EXPERIMENTAL", registry.enable("beta-lab").status === "EXPERIMENTAL");

  registry.register(
    source({ id: "old-path", name: "Old Path", status: "DEPRECATED", enabled: false, category: "PARTNER_NETWORK", priority: 10 }),
  );
  check("deprecated cannot be enabled", throwsRegistry(() => registry.enable("old-path")));
  check("disabling deprecated keeps DEPRECATED", registry.disable("old-path").status === "DEPRECATED");

  // Priority sort and ties
  registry.register(source({ id: "gamma-tie", name: "Gamma", category: "COMMERCE", priority: 50 }));
  const order = registry.list().map((s) => s.id);
  check("list sorts by priority desc then id", order.join(",") === "beta-lab,alpha-feed,gamma-tie,old-path");

  // Filters
  check("category filter", registry.list({ category: "COMMERCE" }).map((s) => s.id).join(",") === "gamma-tie");
  check("discovery type filter", registry.list({ discoveryType: "SEARCH" }).length === 1);
  check("status filter", registry.list({ status: "DEPRECATED" }).length === 1);
  check("enabled filter", registry.list({ enabled: true }).every((s) => s.enabled));
  check(
    "combined filter",
    registry.list({ enabled: true, discoveryType: "API" }).map((s) => s.id).join(",") === "alpha-feed,gamma-tie",
  );
  check("no-match filter is empty", registry.list({ category: "FUTURE_PROVIDER" }).length === 0);

  // Plugins
  const plugin = {
    source: source({
      id: "future-plugin",
      name: "Future Plugin",
      category: "FUTURE_PROVIDER",
      discoveryType: "PLUGIN",
      supportsApi: false,
      supportsPagination: false,
      supportsScheduling: false,
      status: "EXPERIMENTAL",
      priority: 5,
    }),
    discover: async () => ({ candidates: [] }),
  };
  check("plugin registers", registry.registerPlugin(plugin).id === "future-plugin");
  check("plugin adapter is retrievable", registry.getAdapter("future-plugin") === plugin);
  check("non-plugin has no adapter", registry.getAdapter("alpha-feed") === null);
  check(
    "plugin adapter must use PLUGIN type",
    throwsRegistry(() => registry.registerPlugin({ source: source({ id: "not-plugin" }), discover: async () => ({ candidates: [] }) })),
  );

  // Isolation: registries do not share state, module has no I/O or forbidden imports
  check("registries are independent", createDiscoveryRegistry().list().length === 0);
  const dir = join(__dirname, "..", "src", "lib", "discovery");
  const text = readdirSync(dir)
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
  check("no http, sql, or model calls in discovery", !/fetch\(|node:http|getDb|better-sqlite3|anthropic|openai/i.test(text));
  check(
    "no imports outside the discovery module",
    !/from\s+"(?!\.\/)[^"]*"/.test(text),
  );

  console.log(failures === 0 ? "DISCOVERY_SOURCE_REGISTRY_TESTS=PASS" : `DISCOVERY_SOURCE_REGISTRY_TESTS=FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
