import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createPlatformSnapshotFramework,
  createPlatformSnapshotValidator,
  freezeDeepSnapshot,
  isDeepFrozenSnapshot,
  type PlatformSnapshot,
  type PlatformSnapshotDraft,
} from "../src/lib/platform/snapshot-framework.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value);

const STAMP = "2026-10-01T12:00:00.000Z";
const LATER = "2026-10-01T12:05:00.000Z";

function frameworkOf() {
  let n = 0;
  return createPlatformSnapshotFramework({
    timestamp: () => STAMP,
    idFactory: () => `snap-${++n}`,
  });
}

function draft(overrides: Partial<PlatformSnapshotDraft> = {}): PlatformSnapshotDraft {
  return {
    snapshotId: "snap-alpha",
    snapshotType: "alpha-module",
    version: 1,
    timestamp: STAMP,
    author: "operator",
    metadata: { note: "listed", n: 1, flag: true, none: null },
    payload: { title: "Fictional listing", tags: ["alpha", "beta"], nested: { n: 2 } },
    ...overrides,
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

function main() {
  const validator = createPlatformSnapshotValidator();
  const livePayload = { title: "Fictional listing", tags: ["alpha", "beta"], nested: { n: 2 } };
  const liveDraft = draft({ payload: livePayload });
  const fw = frameworkOf();
  const created = fw.create(liveDraft);
  check("Create Snapshot stores a frozen envelope", created.status === "OK" && created.snapshot !== null && created.issues.length === 0);
  const snapshot = created.snapshot!;
  check("the snapshot carries id, type, version, timestamp, author, metadata, and payload", snapshot.snapshotId === "snap-alpha" && snapshot.snapshotType === "alpha-module" && snapshot.version === 1 && snapshot.timestamp === STAMP && snapshot.author === "operator" && snapshot.metadata.note === "listed" && (snapshot.payload as { title: string }).title === "Fictional listing");
  check("Freeze Snapshot: the envelope and payload are deeply frozen", isDeepFrozenSnapshot(snapshot) && isDeepFrozenSnapshot(snapshot.payload) && isDeepFrozenSnapshot(snapshot.metadata));
  check("Validate Snapshot accepts a frozen envelope", fw.validate(snapshot).length === 0 && validator.validateSnapshot(snapshot).length === 0);

  livePayload.title = "mutated draft";
  livePayload.tags.push("gamma");
  livePayload.nested.n = 9;
  check("the stored payload is a copy: mutating the draft does not change the snapshot", (snapshot.payload as { title: string }).title === "Fictional listing" && (snapshot.payload as { tags: string[] }).tags.join() === "alpha,beta" && (snapshot.payload as { nested: { n: number } }).nested.n === 2);

  try {
    (snapshot.payload as { title: string }).title = "no";
  } catch {
    /* freeze may throw in strict mode */
  }
  check("No mutation: a frozen payload keeps its original values", (snapshot.payload as { title: string }).title === "Fictional listing" && Object.isFrozen(snapshot.payload));

  const cloned = fw.clone("snap-alpha", { snapshotId: "snap-alpha-copy", timestamp: LATER, author: "reviewer" });
  check("Clone Snapshot writes a new id and keeps type, version, and payload", cloned.status === "OK" && cloned.snapshot !== null && cloned.snapshot.snapshotId === "snap-alpha-copy" && cloned.snapshot.snapshotType === "alpha-module" && cloned.snapshot.version === 1 && cloned.snapshot.author === "reviewer" && cloned.snapshot.timestamp === LATER && stable(cloned.snapshot.payload) === stable(snapshot.payload));
  check("a clone is independently frozen", cloned.snapshot !== null && isDeepFrozenSnapshot(cloned.snapshot) && cloned.snapshot.payload !== snapshot.payload);
  check("Compare Identity: the original and the clone are not the same identity", !fw.sameIdentity(snapshot, cloned.snapshot!) && fw.sameIdentity(snapshot, fw.identityOf(snapshot)));
  check("Compare Identity: id, type, and version match only when all three match", fw.sameIdentity({ snapshotId: "snap-alpha", snapshotType: "alpha-module", version: 1 }, snapshot) && !fw.sameIdentity({ snapshotId: "snap-alpha", snapshotType: "beta-module", version: 1 }, snapshot) && !fw.sameIdentity({ snapshotId: "snap-alpha", snapshotType: "alpha-module", version: 2 }, snapshot));

  const types = ["alpha-module", "beta-module", "gamma-module", "delta-module", "epsilon-module"] as const;
  const catalog = frameworkOf();
  for (const [index, snapshotType] of types.entries()) {
    catalog.create(draft({ snapshotId: `snap-mod-${index + 1}`, snapshotType, payload: { slot: index + 1 } }));
  }
  check("five module type ids can be stored side by side", types.every((snapshotType, index) => catalog.get(`snap-mod-${index + 1}`)?.snapshotType === snapshotType) && catalog.list().length === 5);
  check("listByType returns only that type", catalog.listByType("gamma-module").length === 1 && catalog.listByType("gamma-module")[0].snapshotId === "snap-mod-3");

  const duplicate = fw.create(draft({ snapshotId: "snap-alpha", payload: { title: "other" } }));
  check("Duplicate Snapshot IDs are rejected", duplicate.status === "REJECTED" && duplicate.snapshot === null && has(duplicate.issues, /Duplicate snapshot id/) && fw.get("snap-alpha") === snapshot);

  const mutableEnvelope: PlatformSnapshot = {
    snapshotId: "snap-mutable",
    snapshotType: "alpha-module",
    version: 1,
    timestamp: STAMP,
    author: "operator",
    metadata: {},
    payload: { title: "open" },
  };
  check("Mutable Payload: an unfrozen payload is rejected", has(validator.validateSnapshot(mutableEnvelope), /Mutable payload/) && has(fw.validate(mutableEnvelope), /Mutable payload/));
  const frozenPayloadOnly = {
    snapshotId: "snap-half",
    snapshotType: "alpha-module",
    version: 1,
    timestamp: STAMP,
    author: "operator",
    metadata: freezeDeepSnapshot({}),
    payload: freezeDeepSnapshot({ title: "open" }),
  };
  check("Mutable Payload: an unfrozen envelope is rejected even when the payload is frozen", has(validator.validateSnapshot(frozenPayloadOnly), /Mutable payload/));

  check("Invalid Metadata: nested values, empty keys, and non-objects", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(validator.validateMetadata({ "": 1 }), /Invalid metadata/) && has(validator.validateMetadata([]), /Invalid metadata/) && has(fw.create(draft({ snapshotId: "snap-meta", metadata: { a: { b: 1 } } as never })).issues, /Invalid metadata/));
  check("Metadata Validation accepts a flat record", validator.validateMetadata({ note: "ok", n: 1, flag: false, none: null }).length === 0);

  check("Invalid Version: zero, a fraction, and a negative number", has(fw.create(draft({ snapshotId: "snap-v0", version: 0 })).issues, /Invalid version/) && has(fw.create(draft({ snapshotId: "snap-vfrac", version: 1.5 })).issues, /Invalid version/) && has(fw.create(draft({ snapshotId: "snap-vneg", version: -1 })).issues, /Invalid version/) && has(validator.validateIdentity({ snapshotId: "snap-v", snapshotType: "alpha-module", version: 0 }), /Invalid version/));

  const frozen = fw.freeze({
    snapshotId: "snap-freeze",
    snapshotType: "beta-module",
    version: 2,
    timestamp: STAMP,
    author: "operator",
    metadata: { k: "v" },
    payload: { title: "listed" },
  });
  check("Freeze Snapshot copies then freezes", isDeepFrozenSnapshot(frozen) && frozen.snapshotId === "snap-freeze" && fw.validate(frozen).length === 0);

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { snapshotType: "alpha-module" }];
  const oddOutcomes = odd.map((value) => {
    try {
      return fw.create(value as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the framework never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.snapshot === null && o.issues.length > 0));

  const missing = fw.clone("snap-missing", { snapshotId: "snap-next" });
  check("cloning an unknown id is rejected", missing.status === "REJECTED" && has(missing.issues, /not stored/));

  const other = frameworkOf();
  other.create(draft({ snapshotId: "snap-alpha", payload: { title: "Other registry" } }));
  check("Independent execution: two registries do not share stored snapshots", (fw.get("snap-alpha")!.payload as { title: string }).title === "Fictional listing" && (other.get("snap-alpha")!.payload as { title: string }).title === "Other registry");
  check("the caller draft payload is still the mutated live object", livePayload.title === "mutated draft");

  const generatedId = frameworkOf().create({ snapshotType: "alpha-module", author: "operator", payload: { title: "auto" } });
  check("Create Snapshot can mint an id and version when they are omitted", generatedId.status === "OK" && generatedId.snapshot?.snapshotId === "snap-1" && generatedId.snapshot?.version === 1 && generatedId.snapshot?.timestamp === STAMP);

  const dir = join(process.cwd(), "src/lib/platform");
  const names = walk(dir).filter((f) => /[\\/]snapshot-(framework|builder|validator|types|registry)\.ts$/.test(f));
  check(
    "five modules exist: snapshot framework, builder, validator, types, registry",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "snapshot-builder.ts,snapshot-framework.ts,snapshot-registry.ts,snapshot-types.ts,snapshot-validator.ts",
  );
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no LP, Opportunity, Traffic, ProductFacts, or advertising platform is named anywhere, comments included", !lines.some((l) => /lp-builder|opportunity|traffic|product-facts|google|facebook|tiktok|\bseo\b|campaign|budget|slug|clickbank/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(snapshot-framework|snapshot-builder|snapshot-validator|snapshot-types|snapshot-registry)$/;
  check("imports were found", imports.length >= 4);
  check("the framework imports only its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform-adjacent engine is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity|traffic|editing-/.test(i.from)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  check("the clock is injectable and defaults in exactly one builder line", code.filter((l) => /new Date\(/.test(l)).length === 1 && names.some((f) => /snapshot-builder\.ts$/.test(f) && /new Date\(/.test(readFileSync(f, "utf8"))));
  check("no version history surface", !bare.some((l) => /\brestore\b|\bhistory\b|parentVersion|listHistory|versionId/.test(l)));
  check("nothing in the framework assigns into its inputs", !code.some((l) => /\b(input|draft|snapshot|payload|metadata)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the framework builds", code.some((l) => /freezeDeepSnapshot\(/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPlatform snapshot framework: all checks passed.");
}

main();
