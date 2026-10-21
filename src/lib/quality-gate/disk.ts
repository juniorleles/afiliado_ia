import { execFileSync } from "node:child_process";
import { statfsSync } from "node:fs";

export const DISK_STOP_GB = 5;

function fromStatfs(): number {
  const stats = statfsSync("C:\\");
  const bytes = Number(stats.bavail) * Number(stats.bsize);
  return bytes / 1024 ** 3;
}

function fromPowershell(): number {
  const out = execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "[math]::Round((Get-PSDrive C).Free/1GB, 2)"],
    { encoding: "utf8", windowsHide: true },
  );
  return Number(String(out).trim());
}

export function diskFreeGb(): number {
  for (const read of [fromStatfs, fromPowershell]) {
    try {
      const value = read();
      if (Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
    } catch {
      /* try the next reader */
    }
  }
  return Number.NaN;
}

export function diskIsBelowStop(freeGb = diskFreeGb()): boolean {
  return Number.isFinite(freeGb) && freeGb < DISK_STOP_GB;
}
