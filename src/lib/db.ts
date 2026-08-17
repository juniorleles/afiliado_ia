import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "presell-os.db");

const globalForSqlite = globalThis as unknown as {
  presellOsDb?: Database.Database;
};

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      ctaLabel TEXT NOT NULL,
      affiliateUrl TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

export function getDb(): Database.Database {
  if (globalForSqlite.presellOsDb) {
    return globalForSqlite.presellOsDb;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  globalForSqlite.presellOsDb = db;
  return db;
}
