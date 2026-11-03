import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverFromUrls } from "../src/lib/real-product-assets/discover.ts";
import { writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-52-real-product-assets");

async function main() {
  const free = diskFreeGb();
  if (free < DISK_STOP_GB) throw new Error(`C: has ${free} GB free; stopping.`);
  mkdirSync(OUT, { recursive: true });
  const urls = [
    "https://getfemicore.com/help/affiliates.php",
    "https://getfemicore.com/text.php?hop=zzzzz&hopId=4ee34404-eb94-4fcc-9911-a6acd2e2a8d2",
  ];
  const { catalog, report } = await discoverFromUrls({ productName: "FemiCore", urls });
  writeCatalog(catalog);
  const inventory = report.images.map((item) => ({
    id: item.id,
    url: item.url,
    sourcePage: item.sourcePage,
    kind: item.probableKind,
    relevant: item.relevant,
    match: item.match,
    status: item.status,
    policyBlock: item.policyBlock,
  }));
  writeFileSync(path.join(OUT, "femicore-discovery.json"), `${JSON.stringify({ diskFreeGb: free, report: { ...report, images: inventory }, approvedByAgent: false }, null, 2)}\n`);
  writeFileSync(path.join(OUT, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(path.join(OUT, "authorizations.json"), `${JSON.stringify(catalog.events, null, 2)}\n`);
  const outcome = report.images.length > 0 ? "PARTIAL_PENDING_USER_APPROVAL" : report.failures.length ? "BLOCKED" : "EMPTY";
  writeFileSync(path.join(OUT, "real-discovery-status.json"), `${JSON.stringify({ outcome, found: report.images.length, relevant: report.images.filter((item) => item.relevant).length, failures: report.failures }, null, 2)}\n`);
  console.log(`FEMICORE_DISCOVERY outcome=${outcome} found=${report.images.length} failures=${report.failures.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
