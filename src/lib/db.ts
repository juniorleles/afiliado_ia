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
 * Phase 2.5 added publicationStatus. A later pass demotes any published
 * row that has no source facts, so publication status and the public route
 * describe the same record. New INSERTs always set 'draft'.
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
  if (!names.has("productionPageComposition")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productionPageComposition TEXT");
    names.add("productionPageComposition");
  }
  if (!names.has("productionCreativeCompositionJson")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productionCreativeCompositionJson TEXT");
    names.add("productionCreativeCompositionJson");
  }
  if (!names.has("productionPresentation")) {
    db.exec("ALTER TABLE campaigns ADD COLUMN productionPresentation TEXT");
    names.add("productionPresentation");
  }

  // Published means the public route. Rows backfilled to published before
  // source facts existed are drafts. The predicate is structural and names
  // no campaign.
  db.exec(`
    UPDATE campaigns
    SET publicationStatus = 'draft',
        publishedAt = NULL
    WHERE publicationStatus = 'published'
      AND (
        sourceFactsJson IS NULL
        OR trim(sourceFactsJson) = ''
        OR json_valid(sourceFactsJson) = 0
        OR json_type(sourceFactsJson) != 'object'
        OR affiliateUrl IS NULL
        OR trim(affiliateUrl) = ''
        OR headline IS NULL
        OR trim(headline) = ''
        OR ctaLabel IS NULL
        OR trim(ctaLabel) = ''
        OR slug IS NULL
        OR trim(slug) = ''
        OR name IS NULL
        OR trim(name) = ''
        OR (
          (pageComposition IS NULL OR trim(pageComposition) = '')
          AND (productionPageComposition IS NULL OR trim(productionPageComposition) = '')
          AND (body IS NULL OR trim(body) = '')
        )
      )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_manual_overrides (
      campaignId INTEGER NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (campaignId, field)
    );
  `);
  const overrides = db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get() as { version: number } | undefined;
  if (!overrides) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (4, 'campaign-manual-overrides', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_completeness_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      analyzedAt TEXT NOT NULL,
      totalScore INTEGER NOT NULL,
      importerScore INTEGER NOT NULL,
      manualScore INTEGER NOT NULL,
      status TEXT NOT NULL,
      reportJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_completeness_campaign
      ON campaign_completeness_analyses(campaignId, analyzedAt);
  `);
  const completeness = db.prepare("SELECT version FROM schema_migrations WHERE version = 5").get() as { version: number } | undefined;
  if (!completeness) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (5, 'campaign-completeness-analyses', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS fact_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      field TEXT NOT NULL,
      revision INTEGER NOT NULL,
      origin TEXT NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL,
      valueJson TEXT NOT NULL,
      sourceUrl TEXT,
      sourceSection TEXT,
      sourceDomPath TEXT,
      evidenceSnippet TEXT,
      screenshotRef TEXT,
      importSession TEXT,
      capturedAt TEXT NOT NULL,
      capturedBy TEXT NOT NULL,
      lastModified TEXT NOT NULL,
      reason TEXT,
      operation TEXT NOT NULL,
      operatorName TEXT NOT NULL,
      UNIQUE (campaignId, field, revision)
    );
    CREATE INDEX IF NOT EXISTS idx_fact_revisions_campaign ON fact_revisions(campaignId, field, revision);

    CREATE TABLE IF NOT EXISTS fact_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      field TEXT NOT NULL,
      at TEXT NOT NULL,
      userName TEXT NOT NULL,
      operation TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      reason TEXT,
      revision INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_fact_audit_campaign ON fact_audit_log(campaignId, at);
  `);
  const evidence = db.prepare("SELECT version FROM schema_migrations WHERE version = 6").get() as { version: number } | undefined;
  if (!evidence) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (6, 'fact-evidence', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lp_builder_overrides (
      campaignId INTEGER NOT NULL,
      fieldId TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      value TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (campaignId, fieldId)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_builder_overrides_campaign ON lp_builder_overrides(campaignId);

    CREATE TABLE IF NOT EXISTS lp_builder_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      fieldId TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      previousValue TEXT,
      newValue TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lp_builder_audit_campaign ON lp_builder_audit(campaignId, id);
  `);
  const builder = db.prepare("SELECT version FROM schema_migrations WHERE version = 7").get() as { version: number } | undefined;
  if (!builder) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (7, 'lp-builder-overrides', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lp_theme_overrides (
      campaignId INTEGER NOT NULL,
      scope TEXT NOT NULL,
      targetId TEXT NOT NULL,
      token TEXT NOT NULL,
      value TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (campaignId, scope, targetId, token)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_theme_overrides_campaign ON lp_theme_overrides(campaignId);

    CREATE TABLE IF NOT EXISTS lp_theme_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      scope TEXT NOT NULL,
      targetId TEXT NOT NULL,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      previousValue TEXT,
      newValue TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lp_theme_audit_campaign ON lp_theme_audit(campaignId, id);
  `);
  const theme = db.prepare("SELECT version FROM schema_migrations WHERE version = 8").get() as { version: number } | undefined;
  if (!theme) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (8, 'lp-theme-overrides', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lp_media_library (
      campaignId INTEGER NOT NULL,
      libraryId TEXT NOT NULL,
      name TEXT NOT NULL,
      src TEXT NOT NULL,
      alt TEXT NOT NULL,
      caption TEXT NOT NULL,
      decorative INTEGER NOT NULL,
      role TEXT NOT NULL,
      origin TEXT NOT NULL,
      source TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      bytes INTEGER,
      format TEXT NOT NULL,
      crop TEXT NOT NULL,
      rotation INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (campaignId, libraryId)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_media_library_campaign ON lp_media_library(campaignId);

    CREATE TABLE IF NOT EXISTS lp_media_overrides (
      campaignId INTEGER NOT NULL,
      slotId TEXT NOT NULL,
      libraryId TEXT,
      removed INTEGER NOT NULL,
      reason TEXT NOT NULL,
      name TEXT NOT NULL,
      src TEXT NOT NULL,
      alt TEXT NOT NULL,
      caption TEXT NOT NULL,
      decorative INTEGER NOT NULL,
      role TEXT NOT NULL,
      origin TEXT NOT NULL,
      source TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      bytes INTEGER,
      format TEXT NOT NULL,
      crop TEXT NOT NULL,
      rotation INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (campaignId, slotId)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_media_overrides_campaign ON lp_media_overrides(campaignId);

    CREATE TABLE IF NOT EXISTS lp_media_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      slotId TEXT NOT NULL,
      libraryId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      originalAsset TEXT,
      replacementAsset TEXT,
      reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lp_media_audit_campaign ON lp_media_audit(campaignId, id);
  `);
  const media = db.prepare("SELECT version FROM schema_migrations WHERE version = 9").get() as { version: number } | undefined;
  if (!media) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (9, 'lp-media-overrides', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lp_layout_overrides (
      campaignId INTEGER NOT NULL,
      sectionKey TEXT NOT NULL,
      sectionId TEXT NOT NULL,
      visible INTEGER NOT NULL,
      collapsed INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      pinned INTEGER NOT NULL,
      locked INTEGER NOT NULL,
      futureCompatible INTEGER NOT NULL,
      duplicated INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (campaignId, sectionKey)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_layout_overrides_campaign ON lp_layout_overrides(campaignId);

    CREATE TABLE IF NOT EXISTS lp_layout_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      sectionKey TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      version INTEGER NOT NULL,
      previousPosition INTEGER,
      newPosition INTEGER,
      visibilityChange TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lp_layout_audit_campaign ON lp_layout_audit(campaignId, id);
  `);
  const layout = db.prepare("SELECT version FROM schema_migrations WHERE version = 10").get() as { version: number } | undefined;
  if (!layout) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (10, 'lp-layout-overrides', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lp_page_versions (
      id TEXT PRIMARY KEY,
      campaignId INTEGER NOT NULL,
      versionNumber INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      comment TEXT NOT NULL,
      parentId TEXT,
      status TEXT NOT NULL CHECK (status IN ('current', 'published', 'draft', 'archived')),
      action TEXT NOT NULL,
      affectedSections TEXT NOT NULL,
      overrideCount INTEGER NOT NULL,
      snapshotJson TEXT NOT NULL,
      changesJson TEXT NOT NULL,
      UNIQUE (campaignId, versionNumber)
    );
    CREATE INDEX IF NOT EXISTS idx_lp_page_versions_campaign ON lp_page_versions(campaignId, versionNumber);

    CREATE TABLE IF NOT EXISTS lp_page_version_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versionId TEXT NOT NULL,
      campaignId INTEGER NOT NULL,
      overrideType TEXT NOT NULL,
      section TEXT NOT NULL,
      field TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      changeKind TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lp_page_version_changes_version ON lp_page_version_changes(versionId);

    CREATE TABLE IF NOT EXISTS lp_page_version_settings (
      campaignId INTEGER PRIMARY KEY,
      autosave INTEGER NOT NULL
    );
  `);
  const versions = db.prepare("SELECT version FROM schema_migrations WHERE version = 11").get() as { version: number } | undefined;
  if (!versions) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (11, 'lp-page-versions', ?)").run(
      new Date().toISOString(),
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS google_ads_oauth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      client_id_cipher TEXT,
      client_secret_cipher TEXT,
      refresh_token_cipher TEXT,
      environment TEXT NOT NULL,
      customer_id TEXT,
      login_customer_id TEXT,
      account_name TEXT,
      access_level TEXT,
      oauth_status TEXT NOT NULL,
      api_status TEXT NOT NULL,
      last_connection_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  const oauth = db.prepare("SELECT version FROM schema_migrations WHERE version = 12").get() as { version: number } | undefined;
  if (!oauth) {
    db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (12, 'google-ads-oauth', ?)").run(
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
