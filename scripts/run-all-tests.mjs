import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Runs every scripts/test-*.ts and prints one PASS or FAIL line per file, then a summary:
 *
 *   SUMMARY TOTAL=<n> PASS=<n> FAIL=<n>
 *   FAILED <file> ...        (only when something failed)
 *
 * All output goes to stdout. Writing the failure report to stderr made Windows PowerShell 5.1 prefix
 * the first line with "node : " when redirecting with *>, which shifted the failure count. The exit
 * code is 1 when any file fails, 0 otherwise.
 *
 * Options:
 *   --filter <text>   run only the files whose name contains the text
 *   --json <file>     also write the per-file results as JSON (for evidence)
 */

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const filter = option("--filter");
const jsonOut = option("--json");

const dir = path.join(process.cwd(), "scripts");
const files = readdirSync(dir)
  .filter((name) => name.startsWith("test-") && name.endsWith(".ts"))
  .filter((name) => !filter || name.includes(filter))
  .sort();

const results = [];
for (const file of files) {
  const started = Date.now();
  const result = spawnSync("npx", ["tsx", path.join("scripts", file)], {
    encoding: "utf8",
    windowsHide: true,
    shell: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const ms = Date.now() - started;
  const failed = result.status !== 0;
  if (failed) {
    const reason = result.error ? `spawn error: ${result.error.message}` : result.status === null ? `terminated by signal ${result.signal}` : `exit code ${result.status}`;
    console.log(`FAIL ${file} (${reason})\n${stdout}\n${stderr}`);
    results.push({ file, status: "FAIL", reason, ms, output: `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-40).join("\n") });
  } else {
    const oks = (stdout.match(/^OK:/gm) || []).length;
    console.log(`PASS ${file} (${oks} OK)`);
    results.push({ file, status: "PASS", oks, ms });
  }
}

const failedFiles = results.filter((item) => item.status === "FAIL").map((item) => item.file);
const summary = { total: results.length, pass: results.length - failedFiles.length, fail: failedFiles.length };
console.log(`SUMMARY TOTAL=${summary.total} PASS=${summary.pass} FAIL=${summary.fail}`);
for (const file of failedFiles) console.log(`FAILED ${file}`);

if (jsonOut) {
  mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
  writeFileSync(path.resolve(jsonOut), JSON.stringify({ summary, failedFiles, results }, null, 2) + "\n", { encoding: "utf8" });
}
if (failedFiles.length > 0) process.exit(1);
