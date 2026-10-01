/**
 * Platform Kernel — RC1 acceptance audit.
 * Validation only. Does not add kernel behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createEffectiveLayer,
  createGeneratedLayer,
  createManualLayer,
  createOverlayResolver,
  createPlatformEditingFramework,
  createPlatformEditingValidator,
  isDeepFrozenPlatform,
  type PlatformEditingSchema,
  type PlatformRecord,
} from "../src/lib/platform/editing-framework.ts";
import {
  createPlatformSnapshotFramework,
  createPlatformSnapshotValidator,
  isDeepFrozenSnapshot,
} from "../src/lib/platform/snapshot-framework.ts";
import { createPlatformVersionFramework, createPlatformVersionValidator } from "../src/lib/platform/version-framework.ts";
import { createPlatformPreviewFramework, createPlatformPreviewResolver, createPlatformComparisonEngine } from "../src/lib/platform/preview-framework.ts";
import { createPlatformAuditFramework, createPlatformPreviewValidator } from "../src/lib/platform/audit-framework.ts";
import { createPlatformVersionCompare } from "../src/lib/platform/version-compare.ts";
import { createPlatformVersionHistory } from "../src/lib/platform/version-history.ts";
import { createPlatformVersionRestore } from "../src/lib/platform/version-restore.ts";
import { createPlatformSnapshotBuilder } from "../src/lib/platform/snapshot-builder.ts";
import { createPlatformSnapshotRegistry } from "../src/lib/platform/snapshot-registry.ts";
import { createPlatformAuditRecorder } from "../src/lib/platform/audit-recorder.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value);

const SCHEMA: PlatformEditingSchema = {
  fields: ["title", "notes", "priority", "tags", "meta"],
  sections: {
    copy: ["title", "notes"],
    flags: ["priority"],
    items: ["tags"],
    data: ["meta"],
  },
  objectFields: ["meta"],
};

const GENERATED: PlatformRecord = {
  title: "Fictional listing",
  notes: "Plain notes.",
  priority: 3,
  tags: ["alpha", "beta"],
  meta: { note: "base", n: 1, flag: true, none: null },
};

function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function clocks() {
  let t = 0;
  let s = 0;
  let v = 0;
  let a = 0;
  return {
    timestamp: () => new Date(Date.UTC(2026, 9, 1, 12, 0, t++)).toISOString(),
    snapId: () => `snap-${++s}`,
    verId: () => `ver-${++v}`,
    auditId: () => `audit-${++a}`,
  };
}

function main() {
  const clock = clocks();
  const editing = createPlatformEditingFramework(SCHEMA);
  const live = { ...GENERATED, tags: [...(GENERATED.tags as string[])], meta: { ...(GENERATED.meta as object) } } as PlatformRecord;
  const opened = editing.open({ generated: live });
  check("Platform Editing Framework opens", opened.status === "OPEN" && opened.session !== null);
  const session = opened.session!;
  const generatedLayer = createGeneratedLayer(GENERATED, SCHEMA);
  check("Generated Layer is a frozen copy", generatedLayer.layer !== null && isDeepFrozenPlatform(generatedLayer.layer.values) && generatedLayer.layer.values.title === "Fictional listing");
  const manual = createManualLayer(SCHEMA);
  manual.put("title", "Operator title");
  check("Manual Layer stores one override per field", manual.get("title") === "Operator title" && manual.list().notes === undefined);
  const resolver = createOverlayResolver();
  const resolved = resolver.resolve(generatedLayer.layer!.values, manual.list(), SCHEMA);
  const effective = createEffectiveLayer(resolved);
  check("Overlay Resolver keeps generated values without an override", resolved.effective.notes === "Plain notes." && resolved.sources.notes === "GENERATED" && resolved.sources.title === "MANUAL");
  check("Effective Layer is frozen and merged", isDeepFrozenPlatform(effective) && effective.effective.title === "Operator title" && effective.overriddenFields.join() === "title");
  const fieldEdit = session.overrideField("title", "Listed title");
  check("Editing session field override writes the effective layer only", fieldEdit.status === "OK" && fieldEdit.view!.effective.title === "Listed title" && session.generated().title === "Fictional listing");
  live.title = "mutated caller";
  check("No mutation: caller generated record is unchanged by the session copy", session.generated().title === "Fictional listing");

  const snapshots = createPlatformSnapshotFramework({ timestamp: clock.timestamp, idFactory: clock.snapId });
  const builder = createPlatformSnapshotBuilder({ timestamp: clock.timestamp, idFactory: clock.snapId });
  const registry = createPlatformSnapshotRegistry();
  const built = builder.create({ snapshotId: "snap-alpha", snapshotType: "alpha-module", author: "operator", payload: { title: "Fictional listing", nested: { n: 1 } } });
  check("Snapshot Builder creates a frozen envelope", built.status === "OK" && built.snapshot !== null && isDeepFrozenSnapshot(built.snapshot));
  const registered = registry.register(built.snapshot!);
  check("Snapshot Registry stores by id", registered.status === "OK" && registry.get("snap-alpha") === built.snapshot);
  const createdShot = snapshots.create({ snapshotId: "snap-kernel", snapshotType: "alpha-module", author: "operator", payload: { title: "Fictional listing" } });
  check("Snapshot Framework create stores an immutable payload", createdShot.status === "OK" && createdShot.snapshot !== null && isDeepFrozenSnapshot(createdShot.snapshot.payload));
  const snapValidator = createPlatformSnapshotValidator();
  check("Snapshot Validation accepts the stored envelope", snapValidator.validateSnapshot(createdShot.snapshot).length === 0);

  const versions = createPlatformVersionFramework({ snapshots, timestamp: clock.timestamp, idFactory: clock.verId });
  const createdVer = versions.createVersion({ snapshotId: "snap-kernel", author: "operator", reason: "initial", versionId: "ver-alpha" });
  check("Version Store creates a frozen version", createdVer.status === "OK" && createdVer.version !== null && isDeepFrozenSnapshot(createdVer.version));
  const history = createPlatformVersionHistory();
  check("Version History lists oldest first", history.list(versions.listVersions())[0].versionId === "ver-alpha" && versions.listVersions().length === 1);
  snapshots.create({ snapshotId: "snap-beta", snapshotType: "alpha-module", author: "operator", payload: { title: "Later listing" } });
  versions.createVersion({ snapshotId: "snap-beta", author: "operator", reason: "next", versionId: "ver-beta" });
  const compared = versions.compareVersions("ver-alpha", "ver-beta");
  check("Version Compare flags payload differences", compared.status === "OK" && compared.comparison !== null && compared.comparison.snapshotChanged);
  const restored = versions.restoreVersion("ver-alpha", "operator", "roll back");
  check("Version Restore writes a new version and keeps the source", restored.status === "OK" && restored.version !== null && restored.version.versionId !== "ver-alpha" && versions.get("ver-alpha")!.reason === "initial");
  const restorer = createPlatformVersionRestore();
  const restoredCopy = restorer.restore({
    source: versions.get("ver-alpha")!,
    versionId: "ver-restored-copy",
    createdAt: "2026-10-01T12:00:00.000Z",
    author: "operator",
    reason: "copy",
    parentVersionId: "ver-alpha",
  });
  check("Version Restore engine copies snapshot id without rewriting the source", restoredCopy.snapshotId === "snap-kernel" && restoredCopy.origin === "RESTORE" && versions.get("ver-alpha")!.reason === "initial");

  const preview = createPlatformPreviewFramework(SCHEMA);
  const previewOpen = preview.open({ generated: GENERATED, overrides: { title: "Operator title" } });
  check("Preview Framework opens generated, manual, and effective views", previewOpen.status === "OPEN" && previewOpen.session !== null);
  const previewSession = previewOpen.session!;
  previewSession.setMode("GENERATED");
  check("Preview Views: generated layer", previewSession.layer().mode === "GENERATED" && previewSession.layer().values.title === "Fictional listing");
  previewSession.setMode("MANUAL");
  check("Preview Views: manual layer", previewSession.layer().present.title === true && previewSession.layer().values.notes === undefined);
  previewSession.setMode("EFFECTIVE");
  check("Preview Views: effective, side-by-side, and diff", previewSession.effective().title === "Operator title" && previewSession.sideBySide().changedFields.includes("title") && previewSession.diff().rows.length >= 1);
  const previewResolver = createPlatformPreviewResolver();
  check("Preview Resolver returns copies of each layer", previewResolver.layer(previewSession.overlay(), "GENERATED", SCHEMA).values.title === "Fictional listing" && previewResolver.layer(previewSession.overlay(), "EFFECTIVE", SCHEMA).values.title === "Operator title");

  const comparer = createPlatformComparisonEngine();
  const fieldCmp = comparer.compare(previewSession.generated(), previewSession.effective(), SCHEMA);
  check("Comparison Engine: field, object, and section rows", fieldCmp.status === "OK" && fieldCmp.result !== null && fieldCmp.result.fieldChanged && fieldCmp.result.rows.some((row) => row.kind === "SECTION"));
  const metaCmp = comparer.compareMetadata({ a: 1 }, { a: 2 });
  check("Comparison Engine: metadata compare", metaCmp.status === "OK" && metaCmp.result!.metadataChanged);
  const verCmp = comparer.compareVersions({ versionId: "ver-a", payload: GENERATED }, { versionId: "ver-b", payload: { ...GENERATED, title: "Later listing" } }, SCHEMA);
  check("Comparison Engine: version compare", verCmp.status === "OK" && verCmp.result!.versionChanged && verCmp.result!.fieldChanged);
  const versionComparer = createPlatformVersionCompare();
  check("Version Compare helper matches store comparison identity", versionComparer.compare(versions.get("ver-alpha")!, versions.get("ver-beta")!, snapshots.get("snap-kernel")!, snapshots.get("snap-beta")!).fromVersionId === "ver-alpha");

  const audit = createPlatformAuditFramework({ timestamp: clock.timestamp, idFactory: clock.auditId });
  const recorder = createPlatformAuditRecorder({ timestamp: clock.timestamp, idFactory: clock.auditId });
  const recorded = audit.record({
    operation: "preview",
    operator: "operator",
    sourceLayer: "GENERATED",
    targetLayer: "EFFECTIVE",
    changedFields: ["title"],
    previousValue: { title: "Fictional listing" },
    newValue: { title: "Operator title" },
    reason: "review overlay",
  });
  check("Audit Recorder appends a frozen record", recorded.status === "OK" && recorded.record !== null && isDeepFrozenPlatform(recorded.record) && audit.list().length === 1);
  const auditValidator = createPlatformPreviewValidator();
  check("Audit Validation accepts a well-formed record", auditValidator.validateAudit(recorded.record).length === 0);
  const recorderOnly = recorder.record({ operation: "compare", operator: "operator", reason: "standalone" });
  check("Audit Framework and recorder are independent", recorderOnly.status === "OK" && audit.list().length === 1 && recorder.list().length === 1);

  const editingValidator = createPlatformEditingValidator();
  check("Duplicate Override: the same field twice in one patch", has(editingValidator.validatePatch([{ field: "title", value: "a" }, { field: "title", value: "b" }], SCHEMA, GENERATED), /Duplicate override/));
  check("Missing Generated Layer", has(editing.open(null).issues, /Missing generated layer/) && has(editing.open({ generated: { notes: "x" } }).issues, /Missing generated layer|Invalid override|not a supported/));
  const dupShot = snapshots.create({ snapshotId: "snap-kernel", snapshotType: "alpha-module", author: "operator", payload: { title: "other" } });
  check("Duplicate Snapshot ID", dupShot.status === "REJECTED" && has(dupShot.issues, /Duplicate snapshot id/));
  const mutable = {
    snapshotId: "snap-mutable",
    snapshotType: "alpha-module",
    version: 1,
    timestamp: "2026-10-01T12:00:00.000Z",
    author: "operator",
    metadata: {},
    payload: { title: "open" },
  };
  check("Mutable Snapshot", has(snapValidator.validateSnapshot(mutable), /Mutable payload/));
  const dupVer = versions.createVersion({ snapshotId: "snap-kernel", author: "operator", reason: "again", versionId: "ver-alpha" });
  check("Duplicate Version ID", dupVer.status === "REJECTED" && has(dupVer.issues, /Duplicate version id/));
  check("Missing Snapshot", has(versions.createVersion({ snapshotId: "snap-missing", author: "operator", reason: "gone" }).issues, /Missing snapshot/));
  check("Missing Version", versions.get("ver-missing") === null && has(versions.restoreVersion("ver-missing", "operator").issues, /Invalid parent|not found|Missing/));
  check("Invalid Restore: unknown version is rejected", has(versions.previewVersion("ver-missing").issues, /Invalid parent|not found/) && has(createPlatformVersionValidator().validateRestore(null, new Set(), new Set()), /Invalid parent|stored version/));
  check("Circular Version Restore", has(versions.createVersion({ snapshotId: "snap-kernel", author: "operator", reason: "loop", versionId: "ver-loop", parentVersionId: "ver-loop" }).issues, /Circular restore/));
  check("Invalid Metadata: nested overlay, snapshot, version, and audit metadata", has(editingValidator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(snapValidator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(createPlatformVersionValidator().validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(audit.record({ operation: "preview", operator: "operator", reason: "meta", metadata: { a: { b: 1 } } }).issues, /Invalid metadata/));
  check("Invalid Preview", has(preview.open(null).issues, /Invalid preview/) && previewSession.setMode("LIVE").status === "REJECTED");
  check("Invalid Audit Record", has(audit.record({}).issues, /Invalid audit record/) && has(audit.record({ operation: "preview", operator: "operator", reason: "x", previousValue: { a: { b: { c: 1 } } } }).issues, /Invalid audit record/));

  const otherEdit = createPlatformEditingFramework(SCHEMA).open({ generated: GENERATED });
  otherEdit.session!.overrideField("title", "Other session");
  check("Independent execution: two editing sessions", session.view().effective.title === "Listed title" && otherEdit.session!.view().effective.title === "Other session");

  const snapCreateTimed = timed(() => snapshots.create({ snapshotId: "snap-perf", snapshotType: "alpha-module", author: "operator", payload: { title: "perf" } }));
  const snapValidateTimed = timed(() => snapValidator.validateSnapshot(createdShot.snapshot));
  const verCreateTimed = timed(() => versions.createVersion({ snapshotId: "snap-perf", author: "operator", reason: "perf" }));
  const verRestoreTimed = timed(() => versions.restoreVersion("ver-alpha", "operator", "perf restore"));
  const verCompareTimed = timed(() => versions.compareVersions("ver-alpha", "ver-beta"));
  const previewTimed = timed(() => previewResolver.layer(previewSession.overlay(), "EFFECTIVE", SCHEMA));
  const overlayTimed = timed(() => resolver.resolve(GENERATED, { title: "Operator title" }, SCHEMA));
  const auditTimed = timed(() => audit.record({ operation: "preview", operator: "operator", reason: "perf" }));
  const perfRows: Array<[string, number, boolean]> = [
    ["Snapshot Creation", snapCreateTimed.ms, snapCreateTimed.value.status === "OK"],
    ["Snapshot Validation", snapValidateTimed.ms, snapValidateTimed.value.length === 0],
    ["Version Creation", verCreateTimed.ms, verCreateTimed.value.status === "OK"],
    ["Version Restore", verRestoreTimed.ms, verRestoreTimed.value.status === "OK"],
    ["Version Compare", verCompareTimed.ms, verCompareTimed.value.status === "OK"],
    ["Preview Resolution", previewTimed.ms, previewTimed.value.mode === "EFFECTIVE"],
    ["Overlay Resolution", overlayTimed.ms, overlayTimed.value.effective.title === "Operator title"],
    ["Audit Recording", auditTimed.ms, auditTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ok && ms < 2000);
  }

  const dir = join(process.cwd(), "src/lib/platform");
  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign IDs", !bare.some((l) => /campaignId|campaigns\b|lp_page_versions/.test(l)));
  check("No Google Ads logic", !bare.some((l) => /googleads|adwords|\bcpc\b|\bcpa\b|\bbid\b|keyword planner|ads api/i.test(l)));
  check("No LP logic", !lines.some((l) => /lp-builder|presell|cloaking/i.test(l)));
  check("No Opportunity logic", !lines.some((l) => /opportunity/i.test(l)));
  check("No Traffic logic", !lines.some((l) => /traffic/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("No Business Rules (score, rank, recommend, bid)", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|recommend|\bbid\b|\bcpc\b/i.test(l)));
  check("No ProductFacts, Discovery, or advertising platform imports", !joined.includes("product-facts") && !/from ["'][^"']*(discovery|opportunity|traffic|lp-builder)/.test(joined));
  check("No HTTP, database, or file writes in the kernel", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)));

  const dbDir = join(process.cwd(), "data");
  const dbFiles = readdirSync(dbDir).filter((n) => n.startsWith("presell-os.db"));
  for (const name of dbFiles) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPlatform Kernel RC1 acceptance: all checks passed.");
}

main();
