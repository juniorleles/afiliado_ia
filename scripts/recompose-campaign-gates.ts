/**
 * Recompose landing documents for campaigns 186–190 after conditional benefits.
 * Does not change Product Facts, publication, templates, or assets.
 */
import { getCampaignById } from "../src/lib/campaigns.ts";
import { refreshLandingDocument } from "../src/lib/landing-composer/refresh.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { presentLandingDocument } from "../src/lib/landing-composer/present.ts";
import { getDb } from "../src/lib/db.ts";

const IDS = [186, 188, 189, 190] as const;

function snapshot(id: number) {
  const row = getDb()
    .prepare(
      `SELECT id, slug, publicationStatus, publishedAt, presentationTemplate, sourceFactsJson,
              productImageSrc, affiliateUrl, ctaLabel
       FROM campaigns WHERE id = ?`,
    )
    .get(id) as Record<string, unknown>;
  return row;
}

async function main() {
  const before = IDS.map(snapshot);
  for (const id of IDS) {
    const campaign = getCampaignById(id);
    if (!campaign) throw new Error(`missing ${id}`);
    refreshLandingDocument(id);
  }
  const after = IDS.map(snapshot);

  for (let index = 0; index < IDS.length; index += 1) {
    const b = before[index];
    const a = after[index];
    if (a.sourceFactsJson !== b.sourceFactsJson) throw new Error(`facts changed ${IDS[index]}`);
    if (a.publicationStatus !== b.publicationStatus || a.publishedAt !== b.publishedAt) throw new Error(`publication changed ${IDS[index]}`);
    if (a.presentationTemplate !== b.presentationTemplate) throw new Error(`template changed ${IDS[index]}`);
    if (a.productImageSrc !== b.productImageSrc) throw new Error(`image changed ${IDS[index]}`);
    if (a.affiliateUrl !== b.affiliateUrl || a.ctaLabel !== b.ctaLabel) throw new Error(`cta changed ${IDS[index]}`);
  }

  const report = IDS.map((id) => {
    const doc = readStoredLandingDocument(id);
    const presented = doc ? presentLandingDocument(doc) : null;
    const visible = presented ? JSON.stringify(presented).toLowerCase() : "";
    return {
      id,
      slug: after.find((row) => row.id === id)?.slug,
      gates: doc?.metadata.gates ?? null,
      included: doc?.metadata.included ?? null,
      hasBenefits: doc?.sections.some((section) => section.sectionId === "benefits") ?? false,
      blockedClaim: /cholesterol|memory|cognitive|inflammation/.test(visible),
      publicationStatus: after.find((row) => row.id === id)?.publicationStatus,
      template: after.find((row) => row.id === id)?.presentationTemplate,
    };
  });

  for (const slug of ["campanha-testes", "cholibrium", "northwind-qa", "neuroprime"]) {
    const page = await fetch(`http://127.0.0.1:3000/p/${slug}`);
    if (page.status !== 404) throw new Error(`/p/${slug} expected 404 got ${page.status}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
