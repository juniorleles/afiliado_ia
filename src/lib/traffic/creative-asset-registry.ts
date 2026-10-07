/**
 * Creative Readiness Signal: asset registry.
 *
 * Assets are metadata only: an id, a dimension, and the sources that can
 * establish it. No advertising-platform creative is encoded here, and an
 * asset never generates copy, an image, or a video.
 *
 * The registry supports registering, enabling, disabling, and validating
 * assets. Registration copies the asset, so later changes to the caller's
 * object never reach the registry, and everything it returns is frozen. It
 * reads and writes nothing outside its own memory.
 */
import type { CreativeAsset } from "./creative-asset-definitions";
import { validateCreativeAsset } from "./creative-readiness-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficIssue } from "./traffic-validator";

export interface CreativeAssetEntry {
  readonly id: string;
  readonly asset: CreativeAsset;
  readonly enabled: boolean;
}

export class CreativeAssetError extends Error {
  readonly issues: readonly TrafficIssue[];
  constructor(message: string, issues: readonly TrafficIssue[]) {
    super(message);
    this.name = "CreativeAssetError";
    this.issues = issues;
  }
}

export interface CreativeAssetRegistry {
  register(asset: unknown): CreativeAssetEntry;
  enable(id: string): CreativeAssetEntry;
  disable(id: string): CreativeAssetEntry;
  validate(asset: unknown): TrafficIssue[];
  get(id: string): CreativeAssetEntry | null;
  list(): CreativeAssetEntry[];
  count(): number;
}

function copyAsset(asset: CreativeAsset): CreativeAsset {
  return freezeDeepTraffic(JSON.parse(JSON.stringify(asset)) as CreativeAsset);
}

export function createCreativeAssetRegistry(initial: readonly unknown[] = []): CreativeAssetRegistry {
  const assets = new Map<string, { asset: CreativeAsset; enabled: boolean }>();
  const dimensions = new Map<string, string>();

  const entryOf = (id: string): CreativeAssetEntry => {
    const found = assets.get(id) as { asset: CreativeAsset; enabled: boolean };
    return freezeDeepTraffic({ id, asset: found.asset, enabled: found.enabled });
  };
  const mustExist = (id: string) => {
    if (!assets.has(id)) throw new CreativeAssetError("Unknown asset.", [{ field: "id", message: `Unknown asset "${id}".` }]);
  };
  const setEnabled = (id: string, enabled: boolean) => {
    mustExist(id);
    (assets.get(id) as { enabled: boolean }).enabled = enabled;
    return entryOf(id);
  };

  const registry: CreativeAssetRegistry = {
    validate(asset) {
      const issues = validateCreativeAsset(asset);
      const id = (asset as { id?: unknown } | null)?.id;
      const dimension = (asset as { dimension?: unknown } | null)?.dimension;
      if (issues.length === 0 && typeof id === "string" && assets.has(id)) issues.push({ field: "id", message: `Duplicate asset "${id}": an asset with this id is already registered.` });
      if (issues.length === 0 && typeof dimension === "string" && typeof id === "string") {
        const owner = dimensions.get(dimension);
        if (owner !== undefined && owner !== id) issues.push({ field: "dimension", message: `Duplicate asset dimension "${dimension}": already used by "${owner}".` });
      }
      return issues;
    },
    register(asset) {
      const issues = registry.validate(asset);
      if (issues.length > 0) throw new CreativeAssetError("Invalid creative definition.", issues);
      const copy = copyAsset(asset as CreativeAsset);
      assets.set(copy.id, { asset: copy, enabled: copy.enabled });
      dimensions.set(copy.dimension, copy.id);
      return entryOf(copy.id);
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => (assets.has(id) ? entryOf(id) : null),
    list: () => [...assets.keys()].sort().map(entryOf),
    count: () => assets.size,
  };
  for (const asset of initial) registry.register(asset);
  return registry;
}
