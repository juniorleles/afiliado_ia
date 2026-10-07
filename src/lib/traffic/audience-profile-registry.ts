/**
 * Audience Fit Signal: profile registry.
 *
 * Profiles are metadata only: an id, a name, a family, and the structural or
 * contextual requirements of each audience dimension. No advertising-platform
 * audience is encoded here, and a profile never classifies a product.
 *
 * The registry supports registering, enabling, disabling, and validating
 * profiles. Registration copies the profile, so later changes to the caller's
 * object never reach the registry, and everything it returns is frozen. It
 * reads and writes nothing outside its own memory.
 */
import type { AudienceProfile } from "./audience-profile-definitions";
import { validateAudienceProfile } from "./audience-fit-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficIssue } from "./traffic-validator";

export interface AudienceProfileEntry {
  readonly id: string;
  readonly profile: AudienceProfile;
  readonly enabled: boolean;
}

export class AudienceProfileError extends Error {
  readonly issues: readonly TrafficIssue[];
  constructor(message: string, issues: readonly TrafficIssue[]) {
    super(message);
    this.name = "AudienceProfileError";
    this.issues = issues;
  }
}

export interface AudienceProfileRegistry {
  /** Adds a profile. Throws AudienceProfileError for an invalid profile or a duplicate id. */
  register(profile: unknown): AudienceProfileEntry;
  enable(id: string): AudienceProfileEntry;
  disable(id: string): AudienceProfileEntry;
  /** What registering this profile would be told: its own problems, and a duplicate id. Changes nothing. */
  validate(profile: unknown): TrafficIssue[];
  get(id: string): AudienceProfileEntry | null;
  /** Sorted by id. */
  list(): AudienceProfileEntry[];
  count(): number;
}

function copyProfile(profile: AudienceProfile): AudienceProfile {
  return freezeDeepTraffic(JSON.parse(JSON.stringify(profile)) as AudienceProfile);
}

export function createAudienceProfileRegistry(initial: readonly unknown[] = []): AudienceProfileRegistry {
  const profiles = new Map<string, { profile: AudienceProfile; enabled: boolean }>();

  const entryOf = (id: string): AudienceProfileEntry => {
    const found = profiles.get(id) as { profile: AudienceProfile; enabled: boolean };
    return freezeDeepTraffic({ id, profile: found.profile, enabled: found.enabled });
  };
  const mustExist = (id: string) => {
    if (!profiles.has(id)) throw new AudienceProfileError("Unknown profile.", [{ field: "id", message: `Unknown profile "${id}".` }]);
  };
  const setEnabled = (id: string, enabled: boolean) => {
    mustExist(id);
    (profiles.get(id) as { enabled: boolean }).enabled = enabled;
    return entryOf(id);
  };

  const registry: AudienceProfileRegistry = {
    validate(profile) {
      const issues = validateAudienceProfile(profile);
      const id = (profile as { id?: unknown } | null)?.id;
      if (issues.length === 0 && typeof id === "string" && profiles.has(id)) issues.push({ field: "id", message: `Duplicate profile "${id}": a profile with this id is already registered.` });
      return issues;
    },
    register(profile) {
      const issues = registry.validate(profile);
      if (issues.length > 0) throw new AudienceProfileError("Invalid audience definition.", issues);
      const copy = copyProfile(profile as AudienceProfile);
      profiles.set(copy.id, { profile: copy, enabled: copy.enabled });
      return entryOf(copy.id);
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => (profiles.has(id) ? entryOf(id) : null),
    list: () => [...profiles.keys()].sort().map(entryOf),
    count: () => profiles.size,
  };
  for (const profile of initial) registry.register(profile);
  return registry;
}
