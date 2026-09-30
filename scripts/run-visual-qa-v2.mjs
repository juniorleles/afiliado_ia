import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportDir = path.join(root, "data", "production-readiness", "visual-qa-tooling-v2", "reports");
mkdirSync(reportDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  return result.status ?? 1;
}

const steps = [];
function record(name, status) {
  steps.push({ name, status });
  console.log(`STEP ${name}=${status}`);
}

let status = run("npx", ["tsc", "--noEmit"]);
record("typecheck", status === 0 ? "PASS" : "FAIL");

status = run("npx", ["tsx", "scripts/visual-qa/run-geometry.ts"]);
record("geometry", status === 0 ? "PASS" : "FAIL");

status = run("npx", ["playwright", "test", "tests/visual-qa/v2-preview.spec.ts"]);
record("playwright-screenshots", status === 0 ? "PASS" : "FAIL");

status = run("node", ["scripts/visual-qa/run-lighthouse.mjs"]);
record("lighthouse", status === 0 ? "PASS" : "FAIL");

if (process.env.APPLITOOLS_API_KEY) {
  status = run("npx", ["playwright", "test", "tests/visual-qa/applitools.spec.ts"]);
  record("applitools", status === 0 ? "PASS" : "FAIL");
} else {
  record("applitools", "AWAITING_API_KEY");
}

status = run("npx", ["tsx", "scripts/visual-qa/assert-safety.ts"]);
record("safety", status === 0 ? "PASS" : "FAIL");

writeFileSync(path.join(reportDir, "steps.json"), JSON.stringify(steps, null, 2));
const failed = steps.filter((step) => step.status === "FAIL");
if (failed.length) {
  console.error("VISUAL_QA_STEPS_FAILED=" + failed.map((step) => step.name).join(","));
  process.exit(1);
}
console.log("VISUAL_QA_ORCHESTRATION=PASS");
