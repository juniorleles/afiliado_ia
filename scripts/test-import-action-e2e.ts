// npx tsx scripts/test-import-action-e2e.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { importProductAction } from "../src/app/admin/generate/actions.ts";
import { executeGenerateImport, normalizeImportInput } from "../src/lib/execute-generate-import.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

const generateSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/generate-client.tsx"), "utf8");
assert(generateSrc.includes("onClick={handleImport}"), "Import facts button calls handleImport");
assert(generateSrc.includes("importProductAction"), "handleImport uses importProductAction");
assert(generateSrc.includes("operatorProductName: operatorName"), "Product name field is passed into the import action");
assert(generateSrc.includes("url: sourceUrl.trim()"), "Source URL field is passed into the import action");
assert(!generateSrc.includes("importProductAction(sourceUrl.trim(), productName.trim())"), "Import facts no longer calls the two-string action signature");

const actionSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/actions.ts"), "utf8");
assert(actionSrc.includes("export async function importProductAction"), "server action used by Import facts exists");
  assert(actionSrc.includes("executeGenerateImport(parsed)"), "importProductAction is connected to executeGenerateImport");
assert(actionSrc.includes("operatorProductName"), "server action forwards the form product name");

const parsed = normalizeImportInput({
  url: "https://completejointcare.net/cb/",
  operatorProductName: "biodynamix",
  importId: "imp_test",
});
assert(parsed.operatorProductName === "biodynamix", "normalizeImportInput keeps the operator-entered product name");
assert(parsed.importId === "imp_test", "normalizeImportInput keeps the import job id for progress and cancel");
assert(normalizeImportInput("https://completejointcare.net/cb/", "biodynamix").operatorProductName === "biodynamix", "legacy two-arg signature still forwards the product name");

const original = "https://completejointcare.net/cb/";
const alt = "https://merchant.example/biodynamix";
const fetched: string[] = [];
const searches: string[] = [];
const altHtml = `<html><head><meta property="og:title" content="biodynamix" /></head>
<body>
<h1>biodynamix</h1>
<p>biodynamix is a joint-care supplement.</p>
<h2>What's Inside</h2>
<ul><li>Glucosamine sulfate</li></ul>
</body></html>`;

async function fetchImpl(input: string): Promise<Response> {
  fetched.push(String(input));
  const url = String(input);
  if (url.endsWith("/robots.txt")) return htmlResponse(200, "User-agent: *\nAllow: /");
  if (url === original) return htmlResponse(403, "<html><head><title>Error 403 - Forbidden</title></head><body><h1>Error 403 - Forbidden</h1></body></html>");
  if (url === alt) return htmlResponse(200, altHtml);
  return htmlResponse(404, "missing");
}

async function main() {
  const result = await executeGenerateImport(
    { url: original, operatorProductName: "biodynamix" },
    {
      fetchImpl,
      searchWeb: async (query) => {
        searches.push(query);
        return [{ url: alt, title: "biodynamix", snippet: "joint-care supplement" }];
      },
    },
  );

  assert(result.ok === true, "HTTP 403 + known product name does not terminate Import facts");
  if (!result.ok) throw new Error(result.error);
  assert(searches[0] === "biodynamix", "Source Resolution primary query is the form product name");
  assert(searches.every((query) => query.startsWith("biodynamix")), "expanded queries stay product-name driven");
  assert(fetched.filter((url) => url === original).length === 1, "primary URL is fetched once and not bypassed");
  assert(result.facts.webDiscovery?.triggered === true, "web discovery ran through the Import facts action path");
  assert(result.facts.webDiscovery?.primaryBlock === "HTTP_403", "primary block is HTTP_403");
  assert(result.facts.webDiscovery?.productName === "biodynamix", "operator product name is the search identity");
  const phases = (result.facts.webDiscovery?.phases || []).map((phase) => phase.phase);
  for (const required of [
    "PRIMARY_BLOCKED",
    "SOURCE_RESOLUTION_STARTED",
    "SEARCH_QUERY",
    "SEARCH_RESULTS",
    "IDENTITY_CHECK",
    "SOURCE_RESOLUTION_COMPLETE",
  ]) {
    assert(phases.includes(required), `phase ${required} recorded`);
  }
  assert(result.facts.webDiscovery?.sources.some((source) => source.status === "ACCEPTED"), "matching source is ACCEPTED");
  assert(result.facts.ingredientsOrComponents.includes("Glucosamine sulfate"), "accepted evidence populates ProductFacts");
  assert(result.facts.origin === "IMPORTED", "recovered facts stay IMPORTED");
  assert(
    (result.facts.webDiscovery?.operatorMessages || []).includes("Primary source returned HTTP 403."),
    "operator message reports HTTP 403",
  );
  assert(
    (result.facts.webDiscovery?.operatorMessages || []).some((message) => message.includes("Searching the web for: biodynamix")),
    "operator message searches by biodynamix",
  );

  assert(typeof importProductAction === "function", "importProductAction is the Import facts server action");

  console.log("\nImport facts action path: HTTP 403 + product name triggers Source Resolution.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
