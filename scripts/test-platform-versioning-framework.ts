import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createPlatformSnapshotFramework, isDeepFrozenSnapshot } from "../src/lib/platform/snapshot-framework.ts";
import { createPlatformVersionFramework, createPlatformVersionValidator, type PlatformVersion } from "../src/lib/platform/version-framework.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value);

function clocks() {
  let t = 0;
  let s = 0;
  let v = 0;
  return {
    timestamp: () => new Date(Date.UTC(2026, 9, 1, 12, 0, t++)).toISOString(),
    snapId: () => `snap-${++s}`,
    verId: () => `ver-${++v}`,
  };
}

function frameworkOf() {
  const clock = clocks();
  const snapshots = createPlatformSnapshotFramework({ timestamp: clock.timestamp, idFactory: clock.snapId });
  const versions = createPlatformVersionFramework({ snapshots, timestamp: clock.timestamp, idFactory: clock.verId });
  return { snapshots, versions, clock };
}

function addSnapshot(
  snapshots: ReturnType<typeof createPlatformSnapshotFramework>,
  over: { snapshotId: string; snapshotType?: string; payload?: Record<string, unknown>; metadata?: Record<string, string | number | boolean | null> },
) {
  return snapshots.create({
    snapshotId: over.snapshotId,
    snapshotType: over.snapshotType ?? "alpha-module",
    author: "operator",
    metadata: over.metadata ?? { note: "listed" },
    payload: over.payload ?? { title: "Fictional listing", tags: ["alpha"], nested: { n: 1 } },
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

function main() {
  const { snapshots, versions } = frameworkOf();
  const shot = addSnapshot(snapshots, { snapshotId: "snap-alpha" });
  check("a snapshot can be stored before a version is created", shot.status === "OK" && shot.snapshot !== null);
  const snapshotBefore = stable(shot.snapshot);

  const created = versions.createVersion({
    snapshotId: "snap-alpha",
    author: "operator",
    reason: "initial",
    metadata: { note: "listed", n: 1, flag: true, none: null },
    versionId: "ver-alpha",
    branch: "main",
  });
  check("Create Version stores a frozen envelope", created.status === "OK" && created.version !== null && created.issues.length === 0);
  const first = created.version!;
  check(
    "the version carries id, snapshot id, parent, created at, author, reason, and metadata",
    first.versionId === "ver-alpha" &&
      first.snapshotId === "snap-alpha" &&
      first.parentVersionId === null &&
      first.author === "operator" &&
      first.reason === "initial" &&
      first.metadata.note === "listed" &&
      first.status === "COMMITTED" &&
      first.branch === "main",
  );
  check("the version envelope is frozen", isDeepFrozenSnapshot(first));
  check("List Versions returns the stored record, oldest first", versions.listVersions().length === 1 && versions.listVersions()[0].versionId === "ver-alpha");

  const listed = versions.listVersions("snap-alpha");
  check("List Versions can filter by snapshot id", listed.length === 1 && listed[0].snapshotId === "snap-alpha");

  const preview = versions.previewVersion("ver-alpha");
  check("Preview Version returns a frozen copy and does not rewrite the store", preview.status === "OK" && preview.version !== null && isDeepFrozenSnapshot(preview.version) && preview.version !== first && stable(preview.version) === stable(first) && versions.get("ver-alpha")!.reason === "initial");

  addSnapshot(snapshots, { snapshotId: "snap-beta", payload: { title: "Other listing", tags: ["beta"], nested: { n: 2 } }, metadata: { note: "other" } });
  const second = versions.createVersion({
    snapshotId: "snap-beta",
    author: "reviewer",
    reason: "next",
    metadata: { note: "changed", n: 2 },
    versionId: "ver-beta",
    branch: "main",
  });
  check("a second version against another snapshot is stored", second.status === "OK" && second.version?.snapshotId === "snap-beta" && second.version.parentVersionId === null);

  const compared = versions.compareVersions("ver-alpha", "ver-beta");
  check("Compare Versions returns a frozen comparison", compared.status === "OK" && compared.comparison !== null && isDeepFrozenSnapshot(compared.comparison));
  const comparison = compared.comparison!;
  check("Snapshot Comparison flags a different snapshot id and payload", comparison.snapshotChanged && comparison.changedPaths.includes("snapshot.snapshotId") && comparison.changedPaths.includes("snapshot.payload"));
  check("Field Comparison flags scalar payload fields", comparison.fieldChanged && comparison.rows.some((row) => row.path === "payload.title" && row.kind === "FIELD" && row.changed));
  check("Object Comparison flags nested payload objects", comparison.objectChanged && comparison.rows.some((row) => row.path === "payload.nested" && row.kind === "OBJECT" && row.changed));
  check("Metadata Comparison flags version metadata", comparison.metadataChanged && comparison.rows.some((row) => row.path === "metadata.note" && row.kind === "METADATA" && row.changed));

  const same = versions.compareVersions("ver-alpha", "ver-alpha");
  check("comparing a version with itself has no changes", same.status === "OK" && same.comparison !== null && same.comparison.changedPaths.length === 0);

  const restored = versions.restoreVersion("ver-alpha", "operator", "roll back");
  check("Restore Version writes a new committed version", restored.status === "OK" && restored.version !== null && restored.version.versionId !== "ver-alpha" && restored.version.origin === "RESTORE" && restored.version.restoreSource === "ver-alpha" && restored.version.status === "COMMITTED" && restored.version.snapshotId === "snap-alpha" && restored.version.branch === "main");
  check("Restore leaves previous versions unchanged", versions.get("ver-alpha")!.reason === "initial" && versions.get("ver-beta")!.reason === "next" && stable(versions.get("ver-alpha")) === stable(first));
  check("the restored version parents the latest record, not itself", restored.version !== null && restored.version.parentVersionId !== restored.version.versionId && restored.version.parentVersionId !== null);

  const duplicated = versions.duplicateVersion("ver-alpha", "operator", "branch copy");
  check("Duplicate Version writes a draft with the source as parent", duplicated.status === "OK" && duplicated.version !== null && duplicated.version.status === "DRAFT" && duplicated.version.origin === "DUPLICATE" && duplicated.version.parentVersionId === "ver-alpha" && duplicated.version.snapshotId === "snap-alpha");

  const deleted = versions.deleteDraftVersion(duplicated.version!.versionId);
  check("Delete Draft Version removes only that draft", deleted.status === "OK" && versions.get(duplicated.version!.versionId) === null && versions.get("ver-alpha") !== null);
  const frozenDelete = versions.deleteDraftVersion("ver-alpha");
  check("a committed version cannot be deleted", frozenDelete.status === "REJECTED" && has(frozenDelete.issues, /not a draft/) && versions.get("ver-alpha") !== null);

  const types = ["alpha-module", "beta-module", "gamma-module", "delta-module", "epsilon-module"] as const;
  const catalog = frameworkOf();
  for (const [index, snapshotType] of types.entries()) {
    addSnapshot(catalog.snapshots, { snapshotId: `snap-mod-${index + 1}`, snapshotType, payload: { slot: index + 1 } });
    catalog.versions.createVersion({ snapshotId: `snap-mod-${index + 1}`, author: "operator", reason: "slot", versionId: `ver-mod-${index + 1}` });
  }
  check(
    "five module type ids can be versioned side by side",
    types.every((_, index) => catalog.versions.get(`ver-mod-${index + 1}`)?.snapshotId === `snap-mod-${index + 1}`) && catalog.versions.listVersions().length === 5,
  );

  const duplicateId = versions.createVersion({ snapshotId: "snap-alpha", author: "operator", reason: "again", versionId: "ver-alpha" });
  check("Duplicate Version IDs are rejected", duplicateId.status === "REJECTED" && duplicateId.version === null && has(duplicateId.issues, /Duplicate version id/) && versions.get("ver-alpha") !== null);

  const missingShot = versions.createVersion({ snapshotId: "snap-missing", author: "operator", reason: "gone" });
  check("Missing Snapshot is rejected", missingShot.status === "REJECTED" && has(missingShot.issues, /Missing snapshot/));

  const badParent = versions.createVersion({ snapshotId: "snap-alpha", author: "operator", reason: "child", versionId: "ver-orphan", parentVersionId: "ver-missing" });
  check("Invalid Parent is rejected", badParent.status === "REJECTED" && has(badParent.issues, /Invalid parent/));

  const circular = versions.createVersion({ snapshotId: "snap-alpha", author: "operator", reason: "loop", versionId: "ver-loop", parentVersionId: "ver-loop" });
  check("Circular Restore: a version cannot parent itself", circular.status === "REJECTED" && has(circular.issues, /Circular restore/));

  const validator = createPlatformVersionValidator();
  const cycle: PlatformVersion[] = [
    { versionId: "ver-one", snapshotId: "snap-alpha", parentVersionId: "ver-two", createdAt: "2026-10-01T12:00:00.000Z", author: "operator", reason: "a", metadata: {}, status: "COMMITTED", origin: "CREATE", restoreSource: null, branch: null },
    { versionId: "ver-two", snapshotId: "snap-alpha", parentVersionId: "ver-one", createdAt: "2026-10-01T12:00:01.000Z", author: "operator", reason: "b", metadata: {}, status: "COMMITTED", origin: "CREATE", restoreSource: null, branch: null },
  ];
  check("Circular Restore: a looping parent chain is rejected", has(validator.validateParent("ver-one", "ver-three", cycle), /Circular restore/));

  check(
    "Invalid Metadata: nested values, empty keys, and non-objects",
    has(validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) &&
      has(validator.validateMetadata({ "": 1 }), /Invalid metadata/) &&
      has(validator.validateMetadata([]), /Invalid metadata/) &&
      has(versions.createVersion({ snapshotId: "snap-alpha", author: "operator", reason: "meta", metadata: { a: { b: 1 } } as never }).issues, /Invalid metadata/),
  );

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { snapshotId: "snap-alpha" }];
  const oddOutcomes = odd.map((value) => {
    try {
      return versions.createVersion(value as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the framework never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.version === null && o.issues.length > 0));

  const other = frameworkOf();
  addSnapshot(other.snapshots, { snapshotId: "snap-alpha" });
  other.versions.createVersion({ snapshotId: "snap-alpha", author: "other", reason: "other store", versionId: "ver-alpha" });
  check("Independent execution: two stores do not share version records", versions.get("ver-alpha")!.author === "operator" && other.versions.get("ver-alpha")!.author === "other");

  check("Snapshot compatibility: versioning does not mutate the stored snapshot", stable(snapshots.get("snap-alpha")) === snapshotBefore && isDeepFrozenSnapshot(snapshots.get("snap-alpha")));
  const live = shot.snapshot!;
  try {
    (live.payload as { title: string }).title = "no";
  } catch {
    /* freeze may throw in strict mode */
  }
  check("No mutation: a frozen snapshot payload keeps its original values after versioning", (snapshots.get("snap-alpha")!.payload as { title: string }).title === "Fictional listing");

  const minted = frameworkOf();
  addSnapshot(minted.snapshots, { snapshotId: "snap-1" });
  const auto = minted.versions.createVersion({ snapshotId: "snap-1", author: "operator", reason: "auto" });
  check("Create Version can mint a version id", auto.status === "OK" && auto.version?.versionId === "ver-1");

  const dir = join(process.cwd(), "src/lib/platform");
  const names = walk(dir).filter((f) => /[\\/]version-(framework|store|history|compare|restore|validator)\.ts$/.test(f));
  check(
    "six modules exist: version framework, store, history, compare, restore, validator",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "version-compare.ts,version-framework.ts,version-history.ts,version-restore.ts,version-store.ts,version-validator.ts",
  );
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no LP, Opportunity, Traffic, ProductFacts, or advertising platform is named anywhere, comments included", !lines.some((l) => /lp-builder|opportunity|traffic|product-facts|google|facebook|tiktok|\bseo\b|campaign|budget|slug|clickbank/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(version-framework|version-store|version-history|version-compare|version-restore|version-validator|snapshot-framework|snapshot-builder|snapshot-validator|snapshot-types|snapshot-registry)$/;
  check("imports were found", imports.length >= 6);
  check("the framework imports only its own modules and the snapshot envelope", imports.every((i) => allowed.test(i.from)));
  check("no platform-adjacent engine is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity|traffic|editing-/.test(i.from)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  check("the clock is injectable and defaults in exactly one store line", code.filter((l) => /new Date\(/.test(l)).length === 1 && names.some((f) => /version-store\.ts$/.test(f) && /new Date\(/.test(readFileSync(f, "utf8"))));
  check("nothing in the framework assigns into its inputs", !code.some((l) => /\b(input|draft|snapshot|payload|metadata|version)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the framework builds", code.some((l) => /freezeDeepSnapshot\(/.test(l)));
  check("restore writes a new envelope instead of rewriting the source", /origin === "RESTORE"/.test(code.join("\n")) && /parentVersionId: input.parentVersionId/.test(code.join("\n")));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPlatform versioning framework: all checks passed.");
}

main();
