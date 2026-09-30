/** Read-only check that the audited draft campaign was not mutated. */
import { getCampaignById } from "../../src/lib/campaigns.ts";
import type { ProductFacts } from "../../src/lib/product-facts.ts";

for (const id of [174, 153]) {
  const record = getCampaignById(id) as unknown as Record<string, unknown> | undefined;
  if (!record) throw new Error(`campaign ${id} not found`);
  const facts = JSON.parse(String(record.sourceFactsJson ?? "null")) as ProductFacts | null;
  console.log(
    `campaign=${id} slug=${record.slug} status=${record.publicationStatus} presentation=${record.productionPresentation} features=${JSON.stringify(facts?.features ?? [])} featuresConfidence=${facts?.confidence.features}`,
  );
}
