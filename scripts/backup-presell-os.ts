import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getDbPath, resetDbForTests } from "../src/lib/db.ts";
import { localMediaRoot } from "../src/lib/storage/local.ts";
import { visualDesignRoot } from "../src/lib/visual-concept/store.ts";

const DB_FILE = "presell-os.db";
/** SQLite sidecars. A stale -wal/-shm next to a replaced file would be replayed against the wrong database. */
const SQLITE_SIDECARS = ["-wal", "-shm", "-journal"];
export const BACKUP_FORMAT = "sqlite-vacuum-into-v1";

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

function removeSidecars(dbFile: string) {
  for (const suffix of SQLITE_SIDECARS) fs.rmSync(`${dbFile}${suffix}`, { force: true });
}

/**
 * Transactionally consistent single-file copy, including frames still in -wal.
 * The copy is switched to rollback journaling so it has no sidecar dependency.
 */
export function snapshotDatabase(source: string, dest: string, options: { readonly?: boolean } = {}): { integrity: string; schemaVersion: number } {
  if (fs.existsSync(dest)) throw new Error(`Snapshot destination already exists: ${dest}`);
  const src = new Database(source, { fileMustExist: true, readonly: options.readonly ?? true });
  try {
    src.pragma("busy_timeout = 5000");
    src.prepare("VACUUM INTO ?").run(dest);
  } finally {
    src.close();
  }
  const out = new Database(dest, { fileMustExist: true });
  try {
    out.pragma("journal_mode = DELETE");
    const integrity = String(out.pragma("integrity_check", { simple: true }));
    let schemaVersion = 0;
    try {
      schemaVersion = (out.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null }).v ?? 0;
    } catch {
      schemaVersion = 0;
    }
    return { integrity, schemaVersion };
  } finally {
    out.close();
    removeSidecars(dest);
  }
}

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function backupRoot(): string {
  return path.join(process.cwd(), "data", "backups");
}

export type BackupOptions = {
  root?: string;
  dbPath?: string;
  mediaDir?: string;
  visualDesignDir?: string;
};

export function createBackup(label = new Date().toISOString().replace(/[:.]/g, "-"), options: BackupOptions = {}): string {
  const dest = path.join(options.root ?? backupRoot(), label);
  if (fs.existsSync(dest)) throw new Error(`Backup destination already exists: ${dest}`);
  const dbPath = options.dbPath ?? getDbPath();
  if (!fs.existsSync(dbPath)) throw new Error("Database file not found; nothing to back up.");
  fs.mkdirSync(dest, { recursive: true });
  const dbOut = path.join(dest, DB_FILE);
  const check = snapshotDatabase(dbPath, dbOut);
  if (check.integrity !== "ok") throw new Error(`Backup snapshot failed integrity_check: ${check.integrity}`);
  copyDir(options.mediaDir ?? localMediaRoot(), path.join(dest, "product-images"));
  copyDir(options.visualDesignDir ?? visualDesignRoot(), path.join(dest, "visual-design"));
  fs.writeFileSync(
    path.join(dest, "MANIFEST.json"),
    JSON.stringify(
      {
        format: BACKUP_FORMAT,
        createdAt: new Date().toISOString(),
        dbPath,
        integrity: check.integrity,
        schemaVersion: check.schemaVersion,
        dbSha256: sha256File(dbOut),
      },
      null,
      2,
    ),
  );
  return dest;
}

/**
 * Stop the app before restoring onto its live database.
 * Legacy backups that carry a copied -wal are replayed into a clean snapshot first.
 */
export function restoreBackup(
  src: string,
  dbDest = getDbPath(),
  mediaDest = localMediaRoot(),
  visualDesignDest = visualDesignRoot(),
): { integrity: string; schemaVersion: number } {
  const dbSrc = path.join(src, DB_FILE);
  if (!fs.existsSync(dbSrc)) throw new Error("Backup is missing presell-os.db");
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "aia-restore-"));
  try {
    const staged = path.join(stage, DB_FILE);
    fs.copyFileSync(dbSrc, staged);
    if (fs.existsSync(`${dbSrc}-wal`)) fs.copyFileSync(`${dbSrc}-wal`, `${staged}-wal`);
    const clean = path.join(stage, "restored.db");
    const check = snapshotDatabase(staged, clean, { readonly: false });
    if (check.integrity !== "ok") throw new Error(`Backup failed integrity_check: ${check.integrity}`);

    if (path.resolve(dbDest) === path.resolve(getDbPath())) resetDbForTests();
    fs.mkdirSync(path.dirname(dbDest), { recursive: true });
    const incoming = `${dbDest}.restore-${process.pid}`;
    fs.copyFileSync(clean, incoming);
    removeSidecars(dbDest);
    fs.renameSync(incoming, dbDest);
    removeSidecars(dbDest);

    copyDir(path.join(src, "product-images"), mediaDest);
    copyDir(path.join(src, "visual-design"), visualDesignDest);
    return check;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].includes("backup-presell-os")) {
  const [command, target] = process.argv.slice(2);
  if (command === "restore") {
    if (!target || !process.argv.includes("--confirm-restore")) {
      console.error("usage: npx tsx scripts/backup-presell-os.ts restore <backupDir> --confirm-restore  (stop the app first)");
      process.exit(2);
    }
    const result = restoreBackup(path.resolve(target));
    console.log(JSON.stringify({ restored: true, ...result }));
  } else {
    console.log(createBackup());
  }
}
