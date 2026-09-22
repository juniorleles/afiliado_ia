import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "scripts");
const files = readdirSync(dir)
  .filter((name) => name.startsWith("test-") && name.endsWith(".ts"))
  .sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync("npx", ["tsx", path.join("scripts", file)], {
    encoding: "utf8",
    windowsHide: true,
    shell: true,
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL ${file}\n${result.stdout}\n${result.stderr}`);
  } else {
    const oks = (result.stdout.match(/^OK:/gm) || []).length;
    console.log(`PASS ${file} (${oks} OK)`);
  }
}
if (failed) {
  process.exit(1);
}
