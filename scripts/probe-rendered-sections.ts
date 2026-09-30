/** Read-only: which composed sections a campaign carries and which the visual master renders. */
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { applyProductionCandidate } from "../src/lib/production-candidate.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";

const RENDERED = new Set(["overview", "features", "usage", "guarantee", "faq"]);
for (const slug of process.argv.slice(2)) {
  const campaign = getCampaignBySlug(slug);
  if (!campaign) {
    console.log(`${slug}: not found`);
    continue;
  }
  const page = parsePresellPage(applyProductionCandidate(campaign).pageComposition);
  const visible = page?.sections.filter((section) => section.visible) ?? [];
  console.log(`${slug} presentation=${campaign.productionPresentation ?? "none"}`);
  for (const section of visible) {
    console.log(`  ${RENDERED.has(section.id) ? "PLACED " : "EXTRA  "} ${section.id} paragraphs=${section.paragraphs.length} bullets=${section.bullets.length} cards=${section.cards.length}`);
    for (const line of section.paragraphs) console.log(`      P: ${line}`);
    for (const line of section.bullets) console.log(`      B: ${line}`);
  }
}
