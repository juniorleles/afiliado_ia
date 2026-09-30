/**
 * Visual independence: a second product must not inherit the first product's
 * visual identity. Compares a candidate art direction against a reference one.
 *
 * npx tsx scripts/test-visual-independence-v1.ts --candidate=<file> --reference=<file>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? "";
const candidatePath = arg("candidate");
const referencePath = arg("reference");
const scanDir = arg("scan");

let failures = 0;
const assert = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

type Art = {
  direction: string;
  primaryArchetype: string;
  secondaryInfluence: string;
  visualContext: string;
  photographicLanguage: string;
  materialVocabulary: string[];
  typographyCharacter: string;
  heroComposition: string;
};
const candidate = JSON.parse(readFileSync(candidatePath, "utf8")) as Art;
const reference = JSON.parse(readFileSync(referencePath, "utf8")) as Art;

assert(candidate.visualContext !== reference.visualContext, "visual context is not inherited", `${candidate.visualContext} vs ${reference.visualContext}`);
assert(
  candidate.photographicLanguage !== reference.photographicLanguage,
  "photographic language is not inherited",
  candidate.photographicLanguage,
);
const shared = candidate.materialVocabulary.filter((item) => reference.materialVocabulary.includes(item));
assert(shared.length === 0, "material vocabulary is not inherited", shared.join(", ") || "no shared terms");

/** Identity terms of the reference product's atmosphere. None of them may appear in the candidate's visual artifacts. */
const FOREIGN_IDENTITY = /\b(stone|olive|mediterranean|marble|terracotta|limestone|joint[- ]genesis|mobility)\b/i;
const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".json")) files.push(full);
  }
};
if (scanDir) walk(scanDir);
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const hit = text.match(FOREIGN_IDENTITY);
  assert(!hit, `no foreign visual identity in ${path.relative(scanDir, file).replace(/\\/g, "/")}`, hit ? hit[0] : "");
}

console.log(failures === 0 ? "VISUAL_INDEPENDENCE=PASS" : `VISUAL_INDEPENDENCE=FAIL failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
