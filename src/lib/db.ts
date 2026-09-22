import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const globalForSqlite = globalThis as unknown as {
  presellOsDb?: Database.Database;
};

export function getDbPath(): string {
  const override = process.env.PRESELL_OS_DB;
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), "data", "presell-os.db");
}

/**
 * Idempotent schema. CREATE TABLE stays the original shape so existing
 * files are untouched; new columns are added with PRAGMA + ALTER.
 *
 * Phase 2.5: existing rows get publicationStatus='published' so live
 * /p/[slug] URLs are not taken offline. New INSERTs always set 'draft'
 * explicitly in campaigns.ts (do not rely on the column default).
 */
export function migrate(db: Database.Database) {
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

  const columns = db.prepare("PRAGMA table_info(campaigns)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  // Migração incremental (Fase 5) — banco criado antes desta fase não tem
  // a coluna headScript. CREATE TABLE IF NOT EXISTS não adiciona coluna em
  // tabela já existente, então checa via PRAGMA antes de tentar o ALTER —
  // sem isso, rodar a migration de novo num banco já migrado quebraria com
  // "duplicate column name".
  if (!names.has("headScript")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN headScript TEXT");
    names.add("headScript");
  }

  // Migração incremental (Fase 7) — campo opcional pra comparar contra o
  // headline real da presell (checagem de "promessa do anúncio bate com o
  // que a página entrega", parte do linter de política).
  if (!names.has("adHeadline")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN adHeadline TEXT");
    names.add("adHeadline");
  }

  // Phase 2.5 — DEFAULT 'published' backfills existing rows only.
  // createCampaign always inserts 'draft'.
  if (!names.has("publicationStatus")) {
    db.exec(
      "ALTER TABLE campaigns ADD COLUMN publicationStatus TEXT NOT NULL DEFAULT 'published'",
    );
    names.add("publicationStatus");
  }

  if (!names.has("publishedAt")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN publishedAt TEXT");
    db.exec(`
      UPDATE campaigns
      SET publishedAt = createdAt
      WHERE publicationStatus = 'published' AND publishedAt IS NULL
    `);
  }

  if (!names.has("pageTemplate")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN pageTemplate TEXT");
    names.add("pageTemplate");
  }
  if (!names.has("pageComposition")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN pageComposition TEXT");
    names.add("pageComposition");
  }
  if (!names.has("productImageSrc")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productImageSrc TEXT");
    names.add("productImageSrc");
  }
  if (!names.has("productImageProvenance")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productImageProvenance TEXT");
    names.add("productImageProvenance");
  }
  if (!names.has("subheadline")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN subheadline TEXT");
    names.add("subheadline");
  }
  if (!names.has("sourceFactsJson")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN sourceFactsJson TEXT");
    names.add("sourceFactsJson");
  }
  if (!names.has("designPlanJson")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN designPlanJson TEXT");
    names.add("designPlanJson");
  }
  if (!names.has("visualTheme")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN visualTheme TEXT");
    names.add("visualTheme");
  }
  if (!names.has("designVersion")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN designVersion INTEGER");
    names.add("designVersion");
  }
  if (!names.has("productAssetStatus")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productAssetStatus TEXT");
    names.add("productAssetStatus");
  }
  if (!names.has("productAssetMetadata")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productAssetMetadata TEXT");
    names.add("productAssetMetadata");
  }
  if (!names.has("creativeCompositionJson")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN creativeCompositionJson TEXT");
    names.add("creativeCompositionJson");
  }
  if (!names.has("creativeCompositionVersion")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN creativeCompositionVersion INTEGER");
    names.add("creativeCompositionVersion");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS presell_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      sessionId TEXT NOT NULL,
      visitedAt TEXT NOT NULL,
      utmSource TEXT,
      utmMedium TEXT,
      utmCampaign TEXT,
      utmContent TEXT,
      utmTerm TEXT,
      gclid TEXT,
      fbclid TEXT,
      msclkid TEXT,
      referrer TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_visits_campaign_time ON presell_visits(campaignId, visitedAt);
    CREATE INDEX IF NOT EXISTS idx_visits_session ON presell_visits(sessionId);
    CREATE INDEX IF NOT EXISTS idx_visits_campaign_session ON presell_visits(campaignId, sessionId);

    CREATE TABLE IF NOT EXISTS cta_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clickId TEXT NOT NULL UNIQUE,
      campaignId INTEGER NOT NULL,
      sessionId TEXT NOT NULL,
      clickedAt TEXT NOT NULL,
      ctaPosition TEXT NOT NULL,
      utmSource TEXT,
      utmMedium TEXT,
      utmCampaign TEXT,
      utmContent TEXT,
      utmTerm TEXT,
      gclid TEXT,
      fbclid TEXT,
      msclkid TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clicks_campaign_time ON cta_clicks(campaignId, clickedAt);
    CREATE INDEX IF NOT EXISTS idx_clicks_session ON cta_clicks(sessionId);
    CREATE INDEX IF NOT EXISTS idx_clicks_clickid ON cta_clicks(clickId);

    CREATE TABLE IF NOT EXISTS affiliate_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      externalTransactionId TEXT NOT NULL,
      transactionType TEXT NOT NULL,
      campaignId INTEGER,
      sessionId TEXT,
      clickId TEXT,
      occurredAt TEXT NOT NULL,
      currency TEXT NOT NULL,
      affiliateCommissionCents INTEGER NOT NULL,
      trackingValue TEXT,
      attributionStatus TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(provider, externalTransactionId, transactionType, occurredAt)
    );
    CREATE INDEX IF NOT EXISTS idx_txn_campaign_time ON affiliate_transactions(campaignId, occurredAt);
    CREATE INDEX IF NOT EXISTS idx_txn_clickid ON affiliate_transactions(clickId);
    CREATE INDEX IF NOT EXISTS idx_txn_type_time ON affiliate_transactions(transactionType, occurredAt);
    CREATE INDEX IF NOT EXISTS idx_txn_attribution ON affiliate_transactions(attributionStatus);

    CREATE TABLE IF NOT EXISTS visual_qa_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      slug TEXT NOT NULL,
      template TEXT NOT NULL,
      status TEXT NOT NULL,
      reportJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visual_qa_campaign ON visual_qa_reports(campaignId, id);

    CREATE TABLE IF NOT EXISTS validation_runs (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      productsJson TEXT NOT NULL,
      summaryJson TEXT,
      crossPageReviewJson TEXT,
      structuralDiversity TEXT
    );

    CREATE TABLE IF NOT EXISTS validation_candidates (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      productKey TEXT NOT NULL,
      productName TEXT NOT NULL,
      approach TEXT NOT NULL,
      template TEXT,
      theme TEXT,
      heroVariant TEXT,
      stagesJson TEXT NOT NULL,
      fingerprintJson TEXT,
      conditionsJson TEXT,
      contentQaJson TEXT,
      sourceQaJson TEXT,
      assetQaJson TEXT,
      visualQaJson TEXT,
      aiReviewJson TEXT,
      performanceJson TEXT,
      failuresJson TEXT,
      humanReview TEXT NOT NULL DEFAULT 'PENDING',
      humanNotes TEXT,
      desktopScreenshot TEXT,
      mobileScreenshot TEXT,
      pageCompositionJson TEXT,
      designPlanJson TEXT,
      creativeJson TEXT,
      factsJson TEXT,
      campaignId INTEGER,
      publicationStatus TEXT NOT NULL DEFAULT 'draft'
    );
    CREATE INDEX IF NOT EXISTS idx_validation_candidates_run ON validation_candidates(runId, createdAt);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL
    );
  `);

  const candidateCols = db.prepare("PRAGMA table_info(validation_candidates)").all() as Array<{ name: string }>;
  const candidateNames = new Set(candidateCols.map((c) => c.name));
  if (!candidateNames.has("strategyMetaJson")) {
    db.exec("ALTER TABLE validation_candidates ADD COLUMN strategyMetaJson TEXT");
  }
  const runCols = db.prepare("PRAGMA table_info(validation_runs)").all() as Array<{ name: string }>;
  const runNames = new Set(runCols.map((c) => c.name));
  if (!runNames.has("marketStrategyJson")) {
    db.exec("ALTER TABLE validation_runs ADD COLUMN marketStrategyJson TEXT");
  }

  const migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get() as { version: number } | undefined;
  if (!migrated) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (1, 'baseline-incremental', ?)").run(
      new Date().toISOString(),
    );
  }
  const lab = db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get() as { version: number } | undefined;
  if (!lab) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (2, 'validation-lab', ?)").run(
      new Date().toISOString(),
    );
  }
  const market = db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get() as { version: number } | undefined;
  if (!market) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (3, 'market-aware-strategy', ?)").run(
      new Date().toISOString(),
    );
  }
}

export function schemaVersion(db = getDb()): number {
  try {
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null };
    return row.version || 0;
  } catch {
    return 0;
  }
}

export function getDb(): Database.Database {
  if (globalForSqlite.presellOsDb) {
    migrate(globalForSqlite.presellOsDb);
    return globalForSqlite.presellOsDb;
  }

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  globalForSqlite.presellOsDb = db;
  return db;
}

/** Test helper: close the cached handle so PRESELL_OS_DB can be swapped. */
export function resetDbForTests(): void {
  if (globalForSqlite.presellOsDb) {
    globalForSqlite.presellOsDb.close();
    globalForSqlite.presellOsDb = undefined;
  }
}
