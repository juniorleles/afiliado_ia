import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIntegrationConfiguration } from "../src/lib/console/configuration.ts";
import { operatorSearchMessage, runConsoleSearch } from "../src/lib/console/gateway.ts";
import { createConsoleStore } from "../src/lib/console/store.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(fg: string, bg: string) {
  const hi = Math.max(luminance(fg), luminance(bg));
  const lo = Math.min(luminance(fg), luminance(bg));
  return (hi + 0.05) / (lo + 0.05);
}

const config = readIntegrationConfiguration();
const serialized = JSON.stringify(config);
check("configuration has no secret material", !/AIza|ya29|sk-|api_key/i.test(serialized) && !serialized.includes("SEARCHAPI_API_KEY="));
check("google ads status is a label", config.googleAds === "Connected" || config.googleAds === "Not Connected");
check("search presence is a label", config.searchApi === "SET" || config.searchApi === "MISSING");

async function main() {
const empty = await runConsoleSearch({ keyword: " ", country: "us", language: "en", device: "desktop", maxPages: 3 });
check("empty keyword is rejected", empty.record.status === "REJECTED" && empty.pages.length === 0);
check("empty keyword message", operatorSearchMessage(empty.record.issues) === "Informe uma Keyword.");

const root = mkdtempSync(join(tmpdir(), "console-store-"));
const store = createConsoleStore(root);
store.saveSearch(empty.record);
store.savePage(empty.record.id, "page-1", "<p>North Offer</p>");
const saved = store.getSearch(empty.record.id);
check("search roundtrip", saved?.keyword === "");
check("page html roundtrip", store.readPage(empty.record.id, "page-1") === "<p>North Offer</p>");
store.writeWatchlist([{
  id: "item-1",
  searchId: empty.record.id,
  productId: "page-1",
  name: "North Offer",
  brand: null,
  priceLabel: null,
  keyword: "north",
  country: "US",
  domain: null,
  landingPageId: "page-1",
  status: "analise",
  priority: "high",
  notes: "nota",
  addedOn: "2026-10-07T00:00:00.000Z",
  events: [{ at: "2026-10-07T00:00:00.000Z", label: "Entrou na fila" }],
}]);
check("watchlist roundtrip", store.readWatchlist()[0]?.notes === "nota" && store.readWatchlist()[0]?.events.length === 1);
check("path traversal is ignored", store.readPage("../package", "json") === null);
rmSync(root, { recursive: true, force: true });

check("dark primary text contrast", ratio("c5cdf8", "1b1e2a") >= 4.5);
check("light primary text contrast", ratio("2f3cc9", "ffffff") >= 4.5);

console.log(failures === 0 ? "CONSOLE_INTEGRATION_PASS" : `CONSOLE_INTEGRATION_FAIL ${failures}`);
if (failures > 0) process.exit(1);
}

void main();
