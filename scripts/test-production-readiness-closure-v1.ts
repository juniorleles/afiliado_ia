// npx tsx scripts/test-production-readiness-closure-v1.ts
// Dynamic sitemap, WAL-safe backup/restore, and the pre-deploy media contract. Fictional fixtures only.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createBackup, restoreBackup } from "./backup-presell-os.ts";
import { getDb, getDbPath, resetDbForTests, schemaVersion } from "../src/lib/db.ts";
import { createCampaign, publishCampaign, unpublishCampaign, type Campaign } from "../src/lib/campaigns.ts";
import { readyPublicationInput } from "./fixtures/ready-publication-campaign.ts";
import { campaignMediaReport } from "../src/lib/deploy/media-contract.ts";
import { PRODUCTION_PRESENTATION_ID } from "../src/lib/production-candidate-view.ts";
import sitemap from "../src/app/sitemap.ts";

let passed = 0;
function assert(cond: boolean, msg: string, detail?: unknown) {
  if (!cond) throw new Error("FALHOU: " + msg + (detail === undefined ? "" : ` ${JSON.stringify(detail)}`));
  passed += 1;
  console.log("OK: " + msg);
}

const realDb = path.resolve(process.cwd(), "data", "presell-os.db");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-closure-"));
const savedEnv = { db: process.env.PRESELL_OS_DB, media: process.env.PRESELL_OS_MEDIA, site: process.env.PUBLIC_SITE_URL };
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function useDb(file: string) {
  resetDbForTests();
  process.env.PRESELL_OS_DB = file;
  if (path.resolve(getDbPath()) === realDb) throw new Error("refusing to run against the real database");
}

function input(slug: string) {
  return readyPublicationInput({
    name: `Fictional ${slug}`,
    slug,
    affiliateUrl: "https://fictional.hop.clickbank.net/?tid=x",
  });
}

function rowsIn(file: string): string[] {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare("SELECT slug FROM campaigns ORDER BY slug").all() as Array<{ slug: string }>).map((row) => row.slug);
  } finally {
    db.close();
  }
}

try {
  // ---- 1. Dynamic sitemap / robots ----------------------------------------------------------
  const sitemapSrc = fs.readFileSync("src/app/sitemap.ts", "utf8");
  const robotsSrc = fs.readFileSync("src/app/robots.ts", "utf8");
  assert(/export const dynamic = "force-dynamic"/.test(sitemapSrc), "sitemap is rendered per request");
  assert(/export const dynamic = "force-dynamic"/.test(robotsSrc), "robots.txt reads the runtime public origin");
  assert(!/generateStaticParams|revalidate\s*=/.test(sitemapSrc), "sitemap has no build-time snapshot config");

  useDb(path.join(tmp, "sitemap.db"));
  process.env.PUBLIC_SITE_URL = "https://fictional-reviews.example";
  const draft = createCampaign(input("fictional-draft-kettle"));
  const live = createCampaign(input("fictional-live-lamp"));
  const urls = () => sitemap().map((entry) => entry.url);
  assert(!urls().some((url) => url.includes("/p/")), "no campaign URLs before publish");
  publishCampaign(live.id);
  assert(urls().includes("https://fictional-reviews.example/p/fictional-live-lamp"), "publish appears without rebuild");
  assert(!urls().some((url) => url.includes(draft.slug)), "draft is absent");
  assert(urls().every((url) => url.startsWith("https://fictional-reviews.example/")), "every URL uses PUBLIC_SITE_URL");
  assert(!urls().some((url) => /\/(admin|preview|visual-frame|api)\b/.test(url)), "no admin/preview/internal URLs");
  unpublishCampaign(live.id);
  assert(!urls().some((url) => url.includes("/p/")), "unpublish disappears without rebuild");

  // ---- 2. WAL-safe backup / restore ---------------------------------------------------------
  const sourceDb = path.join(tmp, "source", "os.db");
  fs.mkdirSync(path.dirname(sourceDb), { recursive: true });
  useDb(sourceDb);
  getDb().pragma("wal_autocheckpoint = 0");
  createCampaign(input("fictional-before-checkpoint"));
  getDb().pragma("wal_checkpoint(TRUNCATE)");
  createCampaign(input("fictional-wal-only-row"));
  assert(fs.statSync(`${sourceDb}-wal`).size > 0, "fixture keeps a committed row only in -wal");
  const expectedRows = rowsIn(sourceDb);
  assert(expectedRows.includes("fictional-wal-only-row"), "committed WAL row is visible to readers");

  const media = path.join(tmp, "source-media");
  const visual = path.join(tmp, "source-visual-design");
  fs.mkdirSync(path.join(visual, "fictional-lamp", "visual-master"), { recursive: true });
  fs.writeFileSync(path.join(visual, "fictional-lamp", "visual-master", "marker.json"), "{}");
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, "aabbccddeeff00112233.png"), Buffer.from("png"));
  const backup = createBackup("closure-v1", { root: path.join(tmp, "backups"), dbPath: sourceDb, mediaDir: media, visualDesignDir: visual });
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, "MANIFEST.json"), "utf8"));
  assert(manifest.format === "sqlite-vacuum-into-v1" && manifest.integrity === "ok", "backup is a verified SQLite snapshot", manifest);
  assert(!fs.existsSync(path.join(backup, "presell-os.db-wal")) && !fs.existsSync(path.join(backup, "presell-os.db-shm")), "backup has no sidecar dependency");
  assert(JSON.stringify(rowsIn(path.join(backup, "presell-os.db"))) === JSON.stringify(expectedRows), "backup contains WAL-committed rows");
  assert(fs.existsSync(path.join(backup, "visual-design", "fictional-lamp", "visual-master", "marker.json")), "backup includes visual-design");
  assert(fs.existsSync(path.join(backup, "product-images", "aabbccddeeff00112233.png")), "backup includes product-images");
  let refused = false;
  try {
    createBackup("closure-v1", { root: path.join(tmp, "backups"), dbPath: sourceDb, mediaDir: media, visualDesignDir: visual });
  } catch {
    refused = true;
  }
  assert(refused, "existing backup is never overwritten");

  // Destination carrying stale sidecars from a different database.
  const dest = path.join(tmp, "dest", "os.db");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const other = new Database(path.join(tmp, "dest", "other.db"));
  other.pragma("journal_mode = WAL");
  other.pragma("wal_autocheckpoint = 0");
  other.exec("CREATE TABLE campaigns (slug TEXT); INSERT INTO campaigns VALUES ('stale-intruder-row');");
  fs.copyFileSync(path.join(tmp, "dest", "other.db"), dest);
  fs.copyFileSync(path.join(tmp, "dest", "other.db-wal"), `${dest}-wal`);
  fs.copyFileSync(path.join(tmp, "dest", "other.db-shm"), `${dest}-shm`);
  other.close();
  const restored = restoreBackup(backup, dest, path.join(tmp, "dest-media"), path.join(tmp, "dest-visual"));
  assert(restored.integrity === "ok", "restore verifies integrity");
  assert(!fs.existsSync(`${dest}-wal`) && !fs.existsSync(`${dest}-shm`), "stale destination -wal/-shm removed");
  const restoredRows = rowsIn(dest);
  assert(JSON.stringify(restoredRows) === JSON.stringify(expectedRows), "restore has exactly the backed-up rows", restoredRows);
  assert(!restoredRows.includes("stale-intruder-row"), "stale sidecars cannot contaminate the restore");
  assert(fs.existsSync(path.join(tmp, "dest-visual", "fictional-lamp", "visual-master", "marker.json")), "restore brings back visual-design");

  const dest2 = path.join(tmp, "dest2", "os.db");
  restoreBackup(backup, dest2, path.join(tmp, "dest2-media"), path.join(tmp, "dest2-visual"));
  assert(sha(dest) === sha(dest2), "restore is deterministic (byte-identical)");

  // Legacy format: live file + -wal copied side by side (the pre-fix createBackup).
  const legacy = path.join(tmp, "legacy");
  fs.mkdirSync(legacy, { recursive: true });
  fs.copyFileSync(sourceDb, path.join(legacy, "presell-os.db"));
  fs.copyFileSync(`${sourceDb}-wal`, path.join(legacy, "presell-os.db-wal"));
  const dest3 = path.join(tmp, "dest3", "os.db");
  restoreBackup(legacy, dest3, path.join(tmp, "dest3-media"), path.join(tmp, "dest3-visual"));
  assert(rowsIn(dest3).includes("fictional-wal-only-row"), "legacy backup WAL rows survive restore");

  resetDbForTests();
  useDb(dest);
  assert(schemaVersion(getDb()) === 3, "restored DB opens with the current schema", schemaVersion(getDb()));
  assert(String(getDb().pragma("journal_mode", { simple: true })) === "wal", "app reopens the restored DB in WAL mode");
  resetDbForTests();

  // ---- 3. Pre-deploy media contract (fictional products) ------------------------------------
  const fixtureData = path.join(process.cwd(), "data", `.tmp-media-contract-${process.pid}`);
  const vdRoot = path.join(fixtureData, "visual-design");
  const slug = "fictional-desk-lamp";
  const vm = path.join(vdRoot, slug, "visual-master");
  fs.mkdirSync(path.join(vm, "assets", "generated"), { recursive: true });
  fs.mkdirSync(path.join(vm, "assets", "provenance"), { recursive: true });
  fs.mkdirSync(path.join(vdRoot, slug, "candidates"), { recursive: true });
  fs.writeFileSync(path.join(vm, "assets", "provenance", "plan.json"), JSON.stringify({ generatedFiles: ["generated/soft-wall-v1.png"] }));
  fs.writeFileSync(
    path.join(vm, "assets", "provenance", "soft-wall-v1.json"),
    JSON.stringify({ assetId: "soft-wall-v1", semanticRoles: ["HERO_ATMOSPHERE"], containsProduct: false, containsPerson: false, textAllowed: false }),
  );
  fs.writeFileSync(path.join(vm, "assets", "generated", "soft-wall-v1.png"), Buffer.from("png"));
  const productRel = path.relative(process.cwd(), path.join(vdRoot, slug, "candidates", "lamp.png")).replace(/\\/g, "/");
  fs.writeFileSync(path.join(vdRoot, slug, "candidates", "lamp.png"), Buffer.from("png"));
  fs.writeFileSync(
    path.join(vm, "product-visual-plan.json"),
    JSON.stringify({
      imageTextReimportAllowed: false,
      factualAuthority: false,
      roles: { HERO_PRODUCT_PRIMARY: { assetId: "lamp", width: 10, height: 10 } },
      sources: [{ assetId: "lamp", localPath: productRel, width: 10, height: 10 }],
      unused: [],
    }),
  );
  try {
    const base = { id: 9001, slug, productionPresentation: PRODUCTION_PRESENTATION_ID } as unknown as Campaign;
    const full = campaignMediaReport(base, vdRoot);
    assert(full.ok && full.presentation === "VISUAL_MASTER", "complete visual-master media passes", full.missing);
    assert(full.requirements.some((r) => r.kind === "VISUAL_ASSET" && r.present) && full.requirements.some((r) => r.kind === "PRODUCT_VISUAL_ROLE" && r.present), "decorative and product media are both required");

    fs.rmSync(path.join(vm, "assets", "generated", "soft-wall-v1.png"));
    const noAsset = campaignMediaReport(base, vdRoot);
    assert(!noAsset.ok && noAsset.missing.some((r) => r.ref === `/media/visual-asset/${slug}/soft-wall-v1`), "missing decorative asset fails");
    fs.writeFileSync(path.join(vm, "assets", "generated", "soft-wall-v1.png"), Buffer.from("png"));

    fs.rmSync(path.join(vdRoot, slug, "candidates", "lamp.png"));
    const noProduct = campaignMediaReport(base, vdRoot);
    assert(!noProduct.ok && noProduct.missing.some((r) => r.kind === "PRODUCT_VISUAL_ROLE"), "missing product image fails");

    const absent = campaignMediaReport({ ...base, slug: "fictional-unshipped-lamp" } as Campaign, vdRoot);
    assert(!absent.ok && absent.missing.some((r) => r.kind === "VISUAL_ASSET_PLAN") && absent.missing.some((r) => r.kind === "PRODUCT_VISUAL_PLAN"), "unshipped visual-design directory fails");

    process.env.PRESELL_OS_MEDIA = path.join(tmp, "legacy-media");
    fs.mkdirSync(process.env.PRESELL_OS_MEDIA, { recursive: true });
    const legacyCampaign = { id: 9002, slug: "fictional-legacy-kettle", productionPresentation: null, productImageUrl: "/media/product/0123456789abcdef0123.png" } as unknown as Campaign;
    assert(!campaignMediaReport(legacyCampaign, vdRoot).ok, "legacy presentation: missing product image fails");
    fs.writeFileSync(path.join(process.env.PRESELL_OS_MEDIA, "0123456789abcdef0123.png"), Buffer.from("png"));
    assert(campaignMediaReport(legacyCampaign, vdRoot).ok, "legacy presentation: present product image passes");

    const checker = fs.readFileSync("src/lib/deploy/media-contract.ts", "utf8") + fs.readFileSync("scripts/predeploy-media-check.ts", "utf8");
    assert(!/joint[\s-]?genesis|controlled-ready|\b153\b/i.test(checker), "media contract has no product/slug-specific logic");
    assert(/snapshotDatabase\(sourceDb, snapshot\)/.test(checker), "pre-deploy check reads a snapshot, not the live DB");
  } finally {
    fs.rmSync(fixtureData, { recursive: true, force: true });
  }
} finally {
  resetDbForTests();
  for (const [key, value] of [["PRESELL_OS_DB", savedEnv.db], ["PRESELL_OS_MEDIA", savedEnv.media], ["PUBLIC_SITE_URL", savedEnv.site]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`Production readiness closure V1: ${passed} checks passed.`);
