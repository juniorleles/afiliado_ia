import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createPlatformAuditFramework } from "../src/lib/platform/audit-framework.ts";
import { createPlatformComparisonEngine } from "../src/lib/platform/comparison-engine.ts";
import { createPlatformPreviewFramework, isDeepFrozenPlatform, type PlatformPreviewViewModel } from "../src/lib/platform/preview-framework.ts";
import type { PlatformEditingSchema, PlatformRecord } from "../src/lib/platform/editing-validator.ts";

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

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

function main() {
  const live = { ...GENERATED, tags: [...(GENERATED.tags as string[])], meta: { ...(GENERATED.meta as object) } } as PlatformRecord;
  const preview = createPlatformPreviewFramework(SCHEMA);
  const opened = preview.open({
    generated: live,
    overrides: { title: "Operator title", meta: { note: "operator", n: 2, flag: false, none: null } },
  });
  check("Preview opens a generated overlay", opened.status === "OPEN" && opened.session !== null && opened.issues.length === 0);
  const session = opened.session!;
  const generatedBefore = stable(session.generated());

  check("Generated View restates the generated record", session.generated().title === "Fictional listing" && session.overlay().sources.title === "MANUAL");
  session.setMode("GENERATED");
  check("Generated View layer copies generated values only", session.layer().mode === "GENERATED" && session.layer().values.title === "Fictional listing" && session.layer().present.title === false && session.layer().sources.title === "GENERATED");

  session.setMode("MANUAL");
  check("Manual View layer holds only overridden fields", session.layer().mode === "MANUAL" && session.layer().values.title === "Operator title" && session.layer().values.notes === undefined && session.layer().present.title === true && session.layer().present.notes === false);

  session.setMode("EFFECTIVE");
  check("Effective View merges generated values with overrides", session.effective().title === "Operator title" && session.effective().notes === "Plain notes." && session.overlay().sources.notes === "GENERATED");

  const side = session.sideBySide();
  check("Side-by-side View lists every field", side.rows.length === SCHEMA.fields.length && isDeepFrozenPlatform(side));
  check("Side-by-side View marks overridden fields as changed", side.changedFields.join() === "title,meta" && side.rows.find((row) => row.field === "title")?.changed === true && side.rows.find((row) => row.field === "notes")?.changed === false);

  const diff = session.diff();
  check("Diff View lists only changed fields", diff.changedFields.join() === "title,meta" && diff.rows.length === 2 && diff.rows.every((row) => row.previous !== row.next) && isDeepFrozenPlatform(diff));

  const compared = session.compare(session.generated(), session.effective());
  check("Field Compare flags scalar fields", compared.status === "OK" && compared.result !== null && compared.result.fieldChanged && compared.result.rows.some((row) => row.path === "title" && row.kind === "FIELD" && row.changed));
  check("Object Compare flags object fields", compared.result!.objectChanged && compared.result!.rows.some((row) => row.path === "meta" && row.kind === "OBJECT" && row.changed));
  check("Section Compare flags a section whose fields differ", compared.result!.sectionChanged && compared.result!.rows.some((row) => row.path === "section.copy" && row.kind === "SECTION" && row.changed) && compared.result!.rows.some((row) => row.path === "section.flags" && row.kind === "SECTION" && !row.changed));

  const comparer = createPlatformComparisonEngine();
  const meta = comparer.compareMetadata({ note: "a", n: 1 }, { note: "b", n: 1 });
  check("Metadata Compare flags changed keys only", meta.status === "OK" && meta.result !== null && meta.result.metadataChanged && meta.result.rows.find((row) => row.path === "metadata.note")?.changed === true && meta.result.rows.find((row) => row.path === "metadata.n")?.changed === false);

  const versions = comparer.compareVersions(
    { versionId: "ver-a", snapshotId: "snap-a", parentVersionId: null, createdAt: "2026-10-01T12:00:00.000Z", metadata: { note: "a" }, payload: GENERATED },
    { versionId: "ver-b", snapshotId: "snap-a", parentVersionId: "ver-a", createdAt: "2026-10-01T12:00:01.000Z", metadata: { note: "b" }, payload: { ...GENERATED, title: "Later listing" } },
    SCHEMA,
  );
  check("Version Compare flags identity, metadata, and payload", versions.status === "OK" && versions.result !== null && versions.result.versionChanged && versions.result.metadataChanged && versions.result.fieldChanged && versions.result.rows.some((row) => row.path === "versionId" && row.kind === "VERSION" && row.changed));

  session.setMode("SIDE_BY_SIDE");
  const model = session.viewModel();
  check("Export ViewModel is frozen and UI-ready", isDeepFrozenPlatform(model) && model.mode === "SIDE_BY_SIDE" && JSON.parse(JSON.stringify(model)).mode === "SIDE_BY_SIDE");
  const roundTrip = JSON.parse(JSON.stringify(model)) as PlatformPreviewViewModel;
  check("UI-ready Output survives a JSON round trip", roundTrip.sideBySide.changedFields.join() === "title,meta" && roundTrip.diff.rows.length === 2 && roundTrip.sections.some((section) => section.id === "copy" && section.changed) && typeof (roundTrip as { open?: unknown }).open === "undefined");

  live.title = "mutated caller";
  check("No mutation: the stored generated layer is a copy", session.generated().title === "Fictional listing" && stable(session.generated()) === generatedBefore && live.title === "mutated caller");

  const types = ["alpha-module", "beta-module", "gamma-module", "delta-module", "epsilon-module"] as const;
  check(
    "five module overlays can be previewed independently",
    types.every((snapshotType, index) => {
      const other = createPlatformPreviewFramework(SCHEMA).open({ generated: { ...GENERATED, title: snapshotType }, overrides: { priority: index + 1 } });
      return other.status === "OPEN" && other.session!.effective().title === snapshotType && other.session!.effective().priority === index + 1;
    }),
  );

  const badPreview = preview.open(null);
  check("Invalid Preview: odd input is rejected", badPreview.status === "REJECTED" && has(badPreview.issues, /Invalid preview/));
  check("Invalid Preview: an unknown mode", session.setMode("LIVE").status === "REJECTED" && has(session.setMode("LIVE").issues, /Invalid preview/) && session.mode() === "SIDE_BY_SIDE");
  const badCompare = comparer.compare(null, GENERATED, SCHEMA);
  check("Invalid Compare: a missing side is rejected", badCompare.status === "REJECTED" && has(badCompare.issues, /Invalid compare/));
  const badVersion = comparer.compareVersions({ title: "no-id" }, { versionId: "ver-b" });
  check("Invalid Compare: a version without an id is rejected", badVersion.status === "REJECTED" && has(badVersion.issues, /Invalid compare|version id/));

  let stamp = 0;
  const audit = createPlatformAuditFramework({
    timestamp: () => new Date(Date.UTC(2026, 9, 1, 12, 0, stamp++)).toISOString(),
    idFactory: () => `audit-${stamp}`,
  });
  const recorded = audit.record({
    auditId: "audit-open",
    operation: "preview",
    operator: "operator",
    sourceLayer: "GENERATED",
    targetLayer: "EFFECTIVE",
    changedFields: ["title", "meta"],
    previousValue: { title: "Fictional listing" },
    newValue: { title: "Operator title" },
    reason: "review overlay",
    metadata: { note: "listed", n: 1, flag: true, none: null },
  });
  check("Audit records operation, operator, timestamp, layers, fields, values, reason, and metadata", recorded.status === "OK" && recorded.record !== null && recorded.record.operation === "preview" && recorded.record.operator === "operator" && recorded.record.sourceLayer === "GENERATED" && recorded.record.targetLayer === "EFFECTIVE" && recorded.record.changedFields.join() === "title,meta" && (recorded.record.previousValue as { title: string }).title === "Fictional listing" && recorded.record.reason === "review overlay" && recorded.record.metadata.note === "listed");
  check("an audit record is frozen", recorded.record !== null && isDeepFrozenPlatform(recorded.record));
  const listed = audit.list();
  check("Audit lists stored records oldest first", listed.length === 1 && listed[0].auditId === "audit-open" && listed[0] !== recorded.record);

  const duplicateAudit = audit.record({
    auditId: "audit-open",
    operation: "compare",
    operator: "operator",
    reason: "again",
  });
  check("a duplicate audit id is rejected and earlier records stay", duplicateAudit.status === "REJECTED" && has(duplicateAudit.issues, /already stored/) && audit.list().length === 1);

  check("Invalid Audit Record: missing operator and operation", has(audit.record({}).issues, /Invalid audit record/));
  check(
    "Invalid Metadata on an audit record",
    has(audit.record({ operation: "preview", operator: "operator", reason: "meta", metadata: { a: { b: 1 } } }).issues, /Invalid metadata/),
  );
  check("Invalid Metadata: nested values, empty keys, and non-objects", has(audit.validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(audit.validator.validateMetadata({ "": 1 }), /Invalid metadata/) && has(audit.validator.validateMetadata([]), /Invalid metadata/));

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}];
  const oddPreview = odd.map((value) => {
    try {
      return preview.open(value as never);
    } catch {
      threw = true;
      return null;
    }
  });
  const oddAudit = odd.map((value) => {
    try {
      return audit.record(value as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the framework never throws: odd input is rejected with reasons", !threw && oddPreview.every((o) => o !== null && o.status === "REJECTED") && oddAudit.every((o) => o !== null && o.status === "REJECTED" && o.record === null && o.issues.length > 0));

  const otherPreview = createPlatformPreviewFramework(SCHEMA).open({ generated: GENERATED, overrides: { title: "Other session" } });
  const otherAudit = createPlatformAuditFramework({ timestamp: () => "2026-10-01T12:00:00.000Z", idFactory: () => "audit-other" });
  otherAudit.record({ operation: "preview", operator: "other", reason: "other store" });
  check("Independent execution: two preview sessions do not share overlay state", session.effective().title === "Operator title" && otherPreview.session!.effective().title === "Other session");
  check("Independent execution: two audit logs do not share records", audit.get("audit-open") !== null && otherAudit.get("audit-open") === null && otherAudit.list().length === 1 && audit.list().length === 1);

  const dir = join(process.cwd(), "src/lib/platform");
  const names = walk(dir).filter((f) => /[\\/](preview-framework|preview-resolver|comparison-engine|audit-framework|audit-recorder|audit-validator)\.ts$/.test(f));
  check(
    "six modules exist: preview framework, preview resolver, comparison engine, audit framework, audit recorder, audit validator",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "audit-framework.ts,audit-recorder.ts,audit-validator.ts,comparison-engine.ts,preview-framework.ts,preview-resolver.ts",
  );
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no LP, Opportunity, Traffic, ProductFacts, or advertising platform is named anywhere, comments included", !lines.some((l) => /lp-builder|opportunity|traffic|product-facts|google|facebook|tiktok|\bseo\b|campaign|budget|slug|clickbank/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(preview-framework|preview-resolver|comparison-engine|audit-framework|audit-recorder|audit-validator|editing-validator|overlay-resolver|generated-layer|manual-layer|effective-layer|editing-framework)$/;
  check("imports were found", imports.length >= 6);
  check("the framework imports only overlay helpers and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform-adjacent engine is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity|traffic|snapshot-|version-/.test(i.from)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  check("the clock is injectable and defaults in exactly one recorder line", code.filter((l) => /new Date\(/.test(l)).length === 1 && names.some((f) => /audit-recorder\.ts$/.test(f) && /new Date\(/.test(readFileSync(f, "utf8"))));
  check("nothing in the framework assigns into its inputs", !code.some((l) => /\b(input|draft|snapshot|payload|metadata|version|generated|overrides)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the framework builds", code.some((l) => /freezeDeepPlatform\(/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPlatform preview and audit framework: all checks passed.");
}

main();
