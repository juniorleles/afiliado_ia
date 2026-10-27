import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LAB_FIXTURE = /^lab-fixture:([\w.-]+)$/;

export function readLabFixtureBytes(url: string, cwd = process.cwd()): Buffer | null {
  const match = url.match(LAB_FIXTURE);
  if (!match) return null;
  const base = path.resolve(cwd, "public", "lab-fixtures");
  const dest = path.resolve(base, match[1]!);
  if (dest !== base && !dest.startsWith(base + path.sep)) return null;
  if (!existsSync(dest)) return null;
  return readFileSync(dest);
}
