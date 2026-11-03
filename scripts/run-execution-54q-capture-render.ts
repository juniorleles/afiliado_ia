// npx tsx scripts/run-execution-54q-capture-render.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPublicPage } from "../src/lib/research-coverage/browser-render.ts";
import { extractSources } from "../src/lib/product-enrichment/extract.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";

const SOURCE_URL = "https://trylymphtonic.com/?hopId=2d135a7c-d9d7-4848-93df-8edcda7156c3";
const DIR = path.join("data/evidence/execution-54q-browser-research");

function redact(value: string): string {
  return value.replace(/hopId=[^&#"]+/gi, "hopId=REDACTED");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  const rendered = await renderPublicPage(SOURCE_URL);
  const html = redact(rendered.html || "");
  writeFileSync(path.join(DIR, "rendered-html-sanitized.txt"), html.slice(0, 40_000));
  writeFileSync(
    path.join(DIR, "browser-render.json"),
    JSON.stringify(
      {
        ok: rendered.ok,
        status: rendered.status,
        finalUrl: redact(rendered.finalUrl || ""),
        elapsedMs: rendered.elapsedMs,
        title: rendered.title,
        visibleChars: rendered.visibleText.length,
        htmlBytes: Buffer.byteLength(rendered.html || "", "utf8"),
        reason: rendered.reason,
      },
      null,
      2,
    ) + "\n",
  );
  if (rendered.ok) {
    const extracted = extractSources([
      {
        url: "https://trylymphtonic.com/?hopId=REDACTED",
        retrievedAt: new Date().toISOString(),
        pageCategory: "PRIMARY",
        html: rendered.html,
        extractionMode: "BROWSER_RENDERED",
      },
    ]);
    const registry = buildEvidenceRegistry({
      sources: [
        {
          url: "https://trylymphtonic.com/?hopId=REDACTED",
          html: rendered.html,
          retrievedAt: new Date().toISOString(),
          extractionMode: "BROWSER_RENDERED",
        },
      ],
    });
    writeFileSync(
      path.join(DIR, "extracted.json"),
      JSON.stringify(
        {
          description: extracted.facts.description || null,
          ingredients: extracted.facts.ingredientsOrComponents,
          features: extracted.facts.features,
          usage: extracted.facts.usageInformation,
          cautions: extracted.facts.cautions,
          pricing: extracted.facts.pricingInformation || null,
          guarantee: extracted.facts.guaranteeInformation || null,
          manufacturer: extracted.facts.manufacturer || null,
          registryCount: registry.entries.length,
          registryFields: registry.entries.map((item) => ({
            id: item.id,
            field: item.field,
            extractionMode: item.extractionMode,
            verification: item.verification,
          })),
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: rendered.ok,
        status: rendered.status,
        visible: rendered.visibleText.length,
        bytes: Buffer.byteLength(rendered.html || "", "utf8"),
        title: rendered.title,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
