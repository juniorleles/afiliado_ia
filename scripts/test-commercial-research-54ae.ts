// npx tsx scripts/test-commercial-research-54ae.ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { inspectPublicHttpsUrl } from "../src/lib/real-product-assets/ssrf.ts";
import { classifyUrlRoles } from "../src/lib/campaign-sources/roles.ts";
import { collectInformationalCandidates } from "../src/lib/research-coverage/discover.ts";
import { runCommercialEvidenceExpansion } from "../src/lib/presell-quality/commercial-research.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { validateFactCandidate } from "../src/lib/presell-quality/recovery.ts";
import { stageImageCandidates } from "../src/lib/presell-quality/asset-recovery.ts";
import type { FieldProposal } from "../src/lib/product-research/types.ts";
import { QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function okPage(url: string, html: string) {
  return { ok: true as const, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
}

function proposal(field: FieldProposal["field"], status: FieldProposal["status"], value: string, extra: Partial<FieldProposal> = {}): FieldProposal {
  return {
    field,
    currentValue: status === "ACCEPTED" ? value : "",
    suggestedValue: value,
    status,
    evidenceIds: extra.evidenceIds ?? ["ev-1"],
    sourceUrl: extra.sourceUrl ?? "https://shop.novalis.example/core",
    sourceClass: extra.sourceClass ?? "SELLER",
    verification: extra.verification ?? "SELLER_STATED",
    restriction: null,
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: extra.notes ?? [],
    evidenceExcerpt: value,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54ae-quality-"));

  const isolated = createCampaign({
    name: "Novalis 54AE",
    slug: `novalis-54ae-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const pages: Record<string, string> = {
    "https://shop.novalis.example/": "<html><title>Novalis Core</title><h1>Novalis Core</h1><p>Keep out of reach of children.</p><a href='https://docs.novalis.example/faq'>FAQ</a><img src='https://shop.novalis.example/bottle.png' /></html>",
    "https://docs.novalis.example/faq": "<html><title>FAQ</title><h1>FAQ</h1><p>How is it taken? One capsule daily.</p></html>",
  };

  const first = await runCommercialEvidenceExpansion(isolated.id, {
    skipSearch: true,
    extraSeeds: ["https://shop.novalis.example/"],
    fetchPage: async (url) => {
      if (/order-now|checkout/i.test(url)) throw new Error("checkout fetched");
      const html = pages[url] ?? pages[url.replace(/\/$/, "") + "/"];
      if (!html) return { ok: false, url, status: 404, reason: "HTTP 404" };
      return okPage(url, html);
    },
  });
  assert(first.inventory.some((item) => item.extracted && item.htmlBytes > 0), "1. extracao HTML da raiz");
  assert(first.inventory.every((item) => !item.checkout || !item.accessed), "3. checkout nao acessado");

  const discovered = collectInformationalCandidates({
    html: pages["https://shop.novalis.example/"],
    pageUrl: "https://shop.novalis.example/",
    relatedHosts: ["docs.novalis.example"],
  });
  assert(discovered.candidates.some((item) => /faq/.test(item.url)), "2. descoberta cross-host controlada");

  const checkout = classifyUrlRoles("https://shop.novalis.example/c/order-now.php");
  assert(checkout.checkout && !checkout.fetchable, "3. bloqueio de /c/order-now.php");
  assert(!inspectPublicHttpsUrl("https://127.0.0.1/").ok, "4. protecao SSRF");

  assert(first.inventory[0]?.sourceClass, "5. classificacao de fontes");
  const warning = first.factCandidates.find((item) => /children/i.test(item.text));
  assert(!warning || Boolean(warning.sourceUrl), "6. proveniencia no candidato");

  const conflict = validateFactCandidate({
    proposal: proposal("description", "FOUND_REVIEW_REQUIRED", "A different description."),
    accepted: [proposal("description", "ACCEPTED", "Novalis Core is a documented capsule.")],
  });
  assert(!conflict.usable && /conflict/i.test(conflict.blockReason ?? ""), "8. conflito preserva o fato aceito");

  const dup = validateFactCandidate({
    proposal: proposal("description", "FOUND_REVIEW_REQUIRED", "Novalis Core is a documented capsule."),
    accepted: [proposal("description", "ACCEPTED", "Novalis Core is a documented capsule.")],
  });
  assert(dup.duplicateOf === "description" && !dup.usable, "9. duplicacao bloqueada");

  const images = stageImageCandidates({
    assets: [
      {
        assetUrl: "https://shop.novalis.example/bottle.png",
        sourceUrl: "https://shop.novalis.example/",
        assetType: "IMAGE",
        context: "test",
        declaredAuthorization: "UNSTATED",
        usageRestrictions: [],
        status: "USER_APPROVED",
        galleryKind: "OTHER",
        hero: false,
        decidedAt: null,
      },
    ],
    productName: "Novalis Core",
    campaignId: isolated.id,
  });
  assert(!images.candidates[0]?.rightsVerified, "10. direitos nao verificados so por estar publico");
  assert(images.heroEligibleCount === 0, "11. hero bloqueado sem packshot aprovado");

  const before237 = campaignIntegritySnapshot(237);
  const other = createCampaign({
    name: "Novalis 54AE B",
    slug: `novalis-54ae-b-${Date.now()}`,
    headline: "B",
    body: "B",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  await runCommercialEvidenceExpansion(other.id, {
    skipSearch: true,
    extraSeeds: ["https://shop.novalis.example/"],
    fetchPage: async (url) => okPage(url, "<html><title>Other</title></html>"),
  });
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "12. aprovacoes e fatos de 237 preservados");
  assert(before237.affiliateUrl === after237.affiliateUrl, "13. isolamento entre campanhas");

  const again = await runCommercialEvidenceExpansion(isolated.id, {
    skipSearch: true,
    extraSeeds: ["https://shop.novalis.example/"],
    fetchPage: async () => {
      throw new Error("should not refetch");
    },
  });
  assert(again.skippedAsRedundant, "14. idempotencia da pesquisa");
  assert(first.editorialPlanStatus === "PREPARED_NOT_APPLIED" && first.regenerationReady === false, "15. plano editorial preparado e nao aplicado");

  assert(QUALITY_TARGET === 85, "regressao 54Z");
  assert(process.env.AIA_ALLOW_PAID_AI === "0", "regressao 54AA");
  assert(snapshotProductResearch(237).latest?.campaignId === 237, "regressao 54AC");

  console.log(`PASS test-commercial-research-54ae.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
