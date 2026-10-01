import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createPlatformEditingFramework,
  createOverlayResolver,
  createPlatformEditingValidator,
  isDeepFrozenPlatform,
  type PlatformEditingSchema,
  type PlatformRecord,
} from "../src/lib/platform/editing-framework.ts";

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

function frameworkOf(schema: PlatformEditingSchema = SCHEMA) {
  return createPlatformEditingFramework(schema);
}

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

function main() {
  const validator = createPlatformEditingValidator();
  check("a well-formed schema is accepted", validator.validateSchema(SCHEMA).length === 0);

  const live = { ...GENERATED, tags: [...(GENERATED.tags as string[])], meta: { ...(GENERATED.meta as object) } } as PlatformRecord;
  const opened = frameworkOf().open({ generated: live });
  check("opening a generated record gives an OPEN session", opened.status === "OPEN" && opened.session !== null && opened.issues.length === 0);
  const session = opened.session!;
  const generatedBefore = stable(session.generated());
  check("with no overrides the effective record equals the generated record", stable(session.view().effective) === generatedBefore && session.view().overriddenFields.length === 0);
  check("the generated layer is frozen", isDeepFrozenPlatform(session.generated()) && isDeepFrozenPlatform(session.view()));

  const fieldEdit = session.overrideField("title", "Operator title");
  check("Field Override replaces only that field", fieldEdit.status === "OK" && fieldEdit.view!.effective.title === "Operator title" && fieldEdit.view!.effective.notes === "Plain notes." && fieldEdit.view!.sources.title === "MANUAL" && fieldEdit.view!.sources.notes === "GENERATED");
  check("the generated layer is unchanged by a field override", stable(session.generated()) === generatedBefore && live.title === "Fictional listing");

  const sectionEdit = session.overrideSection("copy", { notes: "Operator notes." });
  check("Section Override writes the fields of that section", sectionEdit.status === "OK" && sectionEdit.view!.effective.notes === "Operator notes." && sectionEdit.view!.overriddenFields.join() === "title,notes");

  const objectEdit = session.overrideObject("meta", { note: "operator", n: 2, flag: false, none: null });
  const meta = objectEdit.view!.effective.meta as Record<string, unknown>;
  check(
    "Object Override replaces the whole object field",
    objectEdit.status === "OK" && meta.note === "operator" && meta.n === 2 && meta.flag === false && meta.none === null && objectEdit.view!.sources.meta === "MANUAL",
  );

  const listed = session.overrideField("tags", ["alpha"]);
  check("a list field can be overridden", listed.status === "OK" && (listed.view!.effective.tags as string[]).join() === "alpha");

  const resetField = session.resetField("title");
  check("Reset Field drops that override and keeps the others", resetField.status === "OK" && resetField.view!.effective.title === "Fictional listing" && resetField.view!.sources.title === "GENERATED" && resetField.view!.effective.notes === "Operator notes.");

  const resetSection = session.resetSection("copy");
  check("Reset Section drops every override in that section", resetSection.status === "OK" && resetSection.view!.effective.notes === "Plain notes." && resetSection.view!.overriddenFields.join() === "tags,meta");

  const resetAll = session.resetAll();
  check("Reset All restores the generated record", resetAll.status === "OK" && stable(resetAll.view!.effective) === generatedBefore && resetAll.view!.overriddenFields.length === 0);

  const arraySection = session.overrideSection("copy", [
    { field: "title", value: "Listed title" },
    { field: "notes", value: "Listed notes." },
  ]);
  check("a section patch may be a list of field entries", arraySection.status === "OK" && arraySection.view!.effective.title === "Listed title" && arraySection.view!.effective.notes === "Listed notes.");

  const resolver = createOverlayResolver();
  const resolved = resolver.resolve(GENERATED, { title: "Manual" }, SCHEMA);
  check("Effective Resolution keeps generated values for fields without an override", resolved.effective.title === "Manual" && resolved.effective.priority === 3 && resolved.sources.priority === "GENERATED");
  check("the overlay resolver does not write into its inputs", GENERATED.title === "Fictional listing");

  check("Missing Generated Layer: no record at all", has(frameworkOf().open(null).issues, /Missing generated layer/) && has(frameworkOf().open({}).issues, /Missing generated layer/) && has(frameworkOf().open({ generated: null }).issues, /Missing generated layer/));
  const missingTitle = { ...GENERATED, tags: [...(GENERATED.tags as string[])], meta: { ...(GENERATED.meta as object) } } as PlatformRecord;
  delete (missingTitle as { title?: unknown }).title;
  check("Missing Generated Layer: a required field is absent", has(frameworkOf().open({ generated: missingTitle }).issues, /Missing generated layer/));
  check("Invalid Override: an unknown field", has(session.overrideField("score", 1).issues, /Invalid override/) && has(validator.validateField("score", 1, SCHEMA), /Invalid override/));
  check("Invalid Override: a field that is not in the section", has(session.overrideSection("copy", { priority: 9 }).issues, /Invalid override/) && session.view().effective.priority === 3);
  check("Invalid Override: an object write to a non-object field", has(session.overrideObject("title", { a: 1 }).issues, /not an object field/));
  check("Duplicate Override: the same field twice in one patch", has(validator.validatePatch([{ field: "title", value: "a" }, { field: "title", value: "b" }], SCHEMA, GENERATED), /Duplicate override/));
  check("Duplicate Override: a field listed twice in the schema", has(validator.validateSchema({ fields: ["title", "title"], sections: { copy: ["title"] } }), /Duplicate override/));
  check("Invalid Metadata: nested values, empty keys, and non-objects", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(validator.validateMetadata({ "": 1 }), /Invalid metadata/) && has(validator.validateMetadata([]), /Invalid metadata/) && has(session.overrideObject("meta", { a: { b: 1 } }).issues, /Invalid metadata/));
  check("Invalid Override: a scalar written where a list was generated", has(session.overrideField("tags", "alpha").issues, /Invalid override/));

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { generated: 5 }];
  const oddOutcomes = odd.map((value) => {
    try {
      return frameworkOf().open(value as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the framework never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.session === null && o.issues.length > 0));

  const other = frameworkOf().open({ generated: GENERATED });
  other.session!.overrideField("title", "Other session");
  check("Independent execution: two sessions do not share manual state", session.view().effective.title === "Listed title" && other.session!.view().effective.title === "Other session");
  check("the caller generated record is still the original", live.title === "Fictional listing" && GENERATED.title === "Fictional listing");

  const dir = join(process.cwd(), "src/lib/platform");
  const names = walk(dir).filter((f) => /[\\/](editing-framework|generated-layer|manual-layer|effective-layer|overlay-resolver|editing-validator)\.ts$/.test(f));
  check(
    "six modules exist: editing framework, generated layer, manual layer, effective layer, overlay resolver, validator",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "editing-framework.ts,editing-validator.ts,effective-layer.ts,generated-layer.ts,manual-layer.ts,overlay-resolver.ts",
  );
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no LP, Opportunity, Traffic, ProductFacts, or advertising platform is named anywhere, comments included", !lines.some((l) => /lp-builder|opportunity|traffic|product-facts|google|facebook|tiktok|\bseo\b|campaign|budget|slug|clickbank/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(editing-framework|generated-layer|manual-layer|effective-layer|overlay-resolver|editing-validator)$/;
  check("imports were found", imports.length >= 6);
  check("the framework imports only its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform-adjacent engine is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity|traffic/.test(i.from)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  check("the framework does not read a wall clock", !code.some((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l)));
  check("nothing in the framework assigns into its inputs", !code.some((l) => /\b(input|generated|manual|overrides|schema|patch|value)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the framework builds", code.some((l) => /freezeDeepPlatform\(/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPlatform editing framework: all checks passed.");
}

main();
