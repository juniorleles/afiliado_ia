import fs from "node:fs";
import path from "node:path";
import { getDbPath } from "../src/lib/db.ts";
import { localMediaRoot } from "../src/lib/storage/local.ts";

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function backupRoot(): string {
  return path.join(process.cwd(), "data", "backups");
}

export function createBackup(label = new Date().toISOString().replace(/[:.]/g, "-")): string {
  const dest = path.join(backupRoot(), label);
  fs.mkdirSync(dest, { recursive: true });
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, path.join(dest, "presell-os.db"));
  const wal = `${dbPath}-wal`;
  const shm = `${dbPath}-shm`;
  if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(dest, "presell-os.db-wal"));
  if (fs.existsSync(shm)) fs.copyFileSync(shm, path.join(dest, "presell-os.db-shm"));
  copyDir(localMediaRoot(), path.join(dest, "product-images"));
  fs.writeFileSync(path.join(dest, "MANIFEST.json"), JSON.stringify({ createdAt: new Date().toISOString(), dbPath }, null, 2));
  return dest;
}

export function restoreBackup(src: string, dbDest = getDbPath(), mediaDest = localMediaRoot()): void {
  const dbSrc = path.join(src, "presell-os.db");
  if (!fs.existsSync(dbSrc)) throw new Error("Backup is missing presell-os.db");
  fs.mkdirSync(path.dirname(dbDest), { recursive: true });
  fs.copyFileSync(dbSrc, dbDest);
  const mediaSrc = path.join(src, "product-images");
  if (fs.existsSync(mediaSrc)) copyDir(mediaSrc, mediaDest);
}

if (process.argv[1] && process.argv[1].includes("backup-presell-os")) {
  const dest = createBackup();
  console.log(dest);
}
