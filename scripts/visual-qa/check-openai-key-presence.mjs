import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

const local = parseEnv(".env.local");
const key = (process.env.OPENAI_API_KEY || local.OPENAI_API_KEY || "").trim();
console.log("OPENAI_API_KEY_CONFIGURED=" + (key ? "YES" : "NO"));

let ignored = false;
try {
  execSync("git check-ignore -q .env.local", { stdio: "ignore" });
  ignored = true;
} catch {
  ignored = false;
}
console.log("ENV_LOCAL_GIT_IGNORED=" + (ignored ? "YES" : "NO"));

let leaked = false;
if (key) {
  const listed = execSync("git ls-files -z", { encoding: "buffer" });
  for (const name of listed.toString("utf8").split("\0").filter(Boolean)) {
    try {
      if (readFileSync(name).includes(Buffer.from(key))) {
        leaked = true;
        break;
      }
    } catch {
      // unreadable tracked path
    }
  }
}
console.log("SECRET_IN_TRACKED_FILES=" + (leaked ? "YES" : "NO"));

const example = existsSync(".env.example") ? readFileSync(".env.example") : Buffer.alloc(0);
const exampleLeak = key ? example.includes(Buffer.from(key)) : false;
let client = false;
const surfaces = execSync("git ls-files -z src", { encoding: "buffer" });
for (const name of surfaces.toString("utf8").split("\0").filter(Boolean)) {
  const text = readFileSync(name, "utf8");
  if (text.includes("NEXT_PUBLIC_OPENAI") || (key && text.includes(key))) client = true;
}
console.log("CLIENT_SECRET_EXPOSURE=" + (client || exampleLeak ? "YES" : "NO"));
