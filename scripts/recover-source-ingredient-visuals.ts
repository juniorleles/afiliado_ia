/**
 * Recovers same-card ingredient images for one candidate.
 * Does not write ProductFacts, OfferFacts, or the database.
 * Embedded text is read locally when tesseract.js is installed.
 */
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { judgeIngredientVisual, meaningfulEmbeddedText } from "../src/lib/assets/ingredient-visual-association.ts";
import { writeIngredientVisuals, type StoredIngredientVisual } from "../src/lib/assets/source-visual-store.ts";
import { extractSameCardIngredientVisuals } from "../src/lib/import-product.ts";
import { storeProductImageBuffer } from "../src/lib/product-image.ts";

const candidateId = process.argv.find((arg) => arg.startsWith("--candidate="))?.slice("--candidate=".length);
if (!candidateId) {
  console.error("MISSING --candidate=");
  process.exit(1);
}

async function readText(buffer: Buffer, worker: { recognize: (image: Buffer) => Promise<{ data: { text: string } }> }): Promise<string> {
  const meta = await sharp(buffer).metadata();
  const width = Math.max((meta.width ?? 200) * 3, 480);
  const prepared = await sharp(buffer).resize({ width }).png().toBuffer();
  const result = await worker.recognize(prepared);
  return result.data.text || "";
}

async function main() {
  const db = new Database(path.join("data", "presell-os.db"), { readonly: true, fileMustExist: true });
  const row = db.prepare("select factsJson from validation_candidates where id = ?").get(candidateId) as { factsJson: string } | undefined;
  db.close();
  if (!row) {
    console.error("CANDIDATE_MISSING");
    process.exit(1);
  }
  const facts = JSON.parse(row.factsJson) as { sourceUrl?: string; ingredientsOrComponents?: string[] };
  const sourceUrl = facts.sourceUrl?.trim();
  if (!sourceUrl) {
    console.error("SOURCE_URL_MISSING");
    process.exit(1);
  }
  const response = await fetch(sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    console.error("SOURCE_FETCH_FAILED");
    process.exit(1);
  }
  const html = await response.text();
  const visuals = extractSameCardIngredientVisuals(html, sourceUrl);
  const factValues = visuals.map((item) => item.associatedFactValue);
  const sharing = new Map<string, string[]>();
  for (const visual of visuals) {
    const list = sharing.get(visual.assetUrl) ?? [];
    list.push(visual.associatedFactValue);
    sharing.set(visual.assetUrl, list);
  }
  const textByUrl = new Map<string, string>();
  const bytesByUrl = new Map<string, Buffer>();
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng");
  try {
    for (const url of sharing.keys()) {
      const image = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (!image.ok) continue;
      const bytes = Buffer.from(await image.arrayBuffer());
      bytesByUrl.set(url, bytes);
      textByUrl.set(url, await readText(bytes, worker));
    }
  } finally {
    await worker.terminate();
  }
  const records: StoredIngredientVisual[] = [];
  for (const visual of visuals) {
    const raw = textByUrl.get(visual.assetUrl);
    const judgment = judgeIngredientVisual({
      associatedFactValue: visual.associatedFactValue,
      embeddedText: raw ?? null,
      factValuesSharingAsset: sharing.get(visual.assetUrl) ?? [visual.associatedFactValue],
      allFactValues: factValues,
    });
    let localSrc: string | null = null;
    if (judgment.assetAuthority === "SOURCE") {
      const bytes = bytesByUrl.get(visual.assetUrl);
      const stored = bytes ? storeProductImageBuffer(bytes, "image/png", "DIRECT_SOURCE") : null;
      localSrc = stored?.src ?? null;
      if (!localSrc) judgment.assetAuthority = "NONE";
    }
    records.push({
      ...visual,
      localSrc,
      associationConfidence: judgment.associationConfidence,
      embeddedTextStatus: judgment.embeddedTextStatus,
      assetAuthority: localSrc ? judgment.assetAuthority : "NONE",
    });
    const kept = meaningfulEmbeddedText(raw ?? "", visual.associatedFactValue, factValues);
    console.log(
      `${judgment.assetAuthority}\t${judgment.embeddedTextStatus}\t${visual.associatedFactValue}\t${kept}`,
    );
  }
  writeIngredientVisuals(sourceUrl, records);
  const safe = records.filter((record) => record.assetAuthority === "SOURCE").length;
  console.log(`DISCOVERED=${visuals.length}`);
  console.log(`STORED_SAFE=${safe}`);
  console.log(`STORED_RECORDS=${records.length}`);
  console.log(`FACT_COUNT=${facts.ingredientsOrComponents?.length ?? 0}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "recovery failed";
  console.error(message);
  process.exit(1);
});
