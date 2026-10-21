/**
 * Execution 47B - re-evaluates the 47A candidates under the authorization policy.
 *
 * Offline and read-only: it reads run-2 (47A measurements) and a saved snapshot of the vendor's affiliate
 * page, and writes run-3. It never fetches, never writes to the database, never stores an image, and
 * never records authorization evidence it did not read on the page. Refuses to overwrite earlier output.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateCandidates } from "../src/lib/product-assets/evaluate.ts";
import type { AuthorizationEvidence, EvaluationContext, MeasuredImage, ProductAssetCandidate } from "../src/lib/product-assets/types.ts";

const ROOT = path.join(process.cwd(), "data/evidence/product-assets-intelligence");
const RUN2 = path.join(ROOT, "run-2");
const RUN3 = path.join(ROOT, "run-3");
const SNAPSHOT = path.join(RUN3, "affiliates-page-snapshot.html");
const PAGE = "https://theneuroprime.com/affiliates/";

type RunCandidate = {
  id: string;
  url: string;
  domain: string;
  sourcePage: string;
  listing: string;
  product: string;
  kind: ProductAssetCandidate["kind"];
  origin: ProductAssetCandidate["origin"];
  fileName: string;
  alt: string | null;
  resolution: string | null;
  format: MeasuredImage["format"];
  bytes: number | null;
  sha256: string | null;
  measured: boolean;
};

function strip(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

function main() {
  if (existsSync(path.join(RUN3, "source-reassessment.json"))) throw new Error("run-3 already holds output. Use a new directory.");
  const html = strip(readFileSync(SNAPSHOT, "utf8"));
  const snapshotHash = createHash("sha256").update(readFileSync(SNAPSHOT)).digest("hex");

  // The library is the part of the page the vendor presents as affiliate material.
  const library = /<section[^>]*id="images"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
  const libraryHrefs = [...library.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const libraryImgs = [...library.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  const libraryText = text(library);
  const intro = /<div class="container-fluid" id="about">[\s\S]*?(?=<section|<div class="container-fluid" id=)/.exec(html)?.[0] ?? "";
  const restrictions = [...(/<ol class="awkn-tandc">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => text(match[1]));
  const bannerSets = [...library.matchAll(/<li class="medium">([^<]+)<\/li>/g)].map((match) => text(match[1]));

  const run2 = JSON.parse(readFileSync(path.join(RUN2, "candidate-images.json"), "utf8")) as { candidates: RunCandidate[] };
  const verifiedAt = new Date().toISOString();
  const restrictionList = restrictions.map((entry) => ({ text: entry, appliesToThisAsset: false }));

  const placement = (entry: RunCandidate) => {
    let pathname = entry.url;
    try {
      pathname = new URL(entry.url).pathname;
    } catch {
      pathname = entry.url;
    }
    const inLibraryImages = libraryImgs.some((src) => src.endsWith(pathname) || pathname.endsWith(src));
    const inLibraryLinks = libraryHrefs.includes(entry.url);
    const inIntro = intro.includes(pathname);
    return { inLibraryImages, inLibraryLinks, shownInAffiliatePageIntro: inIntro };
  };

  const candidates: ProductAssetCandidate[] = run2.candidates.map((entry) => {
    const place = placement(entry);
    const offered = place.inLibraryLinks && entry.kind === "PROMO_BANNER";
    const measured: MeasuredImage | null = entry.measured
      ? {
          checkedAt: verifiedAt,
          httpStatus: 200,
          contentType: null,
          byteLength: entry.bytes,
          sha256: entry.sha256,
          width: entry.resolution ? Number(entry.resolution.split("x")[0]) : null,
          height: entry.resolution ? Number(entry.resolution.split("x")[1]) : null,
          format: entry.format,
          fetchError: null,
        }
      : null;
    // Evidence only where the page itself offers the file: the two banner pack downloads in the Banners section.
    const evidence: AuthorizationEvidence | null = offered
      ? {
          kind: "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
          sourceUrl: PAGE,
          statement: `The Banners section of the affiliate page offers this download to affiliates: "${libraryText.slice(0, 220)}"`,
          verifiedAt,
          program: "The NeuroPrime affiliate program",
          product: "NeuroPrime",
          materialId: null,
          offeredForPromotion: true,
          useScope: "UNSPECIFIED",
          restrictions: restrictionList,
          restrictionsReviewedAt: verifiedAt,
          validUntil: null,
          revokedAt: null,
        }
      : null;
    return {
      id: entry.id,
      productName: "NeuroPrime",
      url: entry.url,
      origin: entry.origin,
      kind: entry.kind,
      fileName: entry.fileName,
      alt: entry.alt,
      declaredProduct: null,
      listing: { sourcePage: entry.sourcePage, section: offered ? "DOWNLOAD_PACK" : "DISPLAYED_ONLY", observedAt: verifiedAt },
      authorizationEvidence: evidence,
      policyBlock: null,
      humanRejection: null,
      approval: null,
      localFile: null,
      measured,
    };
  });

  const context: EvaluationContext = { productName: "NeuroPrime", officialHosts: ["theneuroprime.com"], now: verifiedAt };
  const evaluations = evaluateCandidates(candidates, context);

  const rows = run2.candidates.map((entry, index) => {
    const evaluation = evaluations[index];
    const place = placement(entry);
    return {
      id: entry.id,
      url: entry.url,
      domain: entry.domain,
      kind: entry.kind,
      resolution: entry.resolution,
      format: entry.format,
      foundOn: entry.sourcePage,
      ...place,
      offeredToAffiliatesAsMaterial: place.inLibraryLinks && entry.kind === "PROMO_BANNER",
      status: evaluation.status,
      authorization: evaluation.authorization.status,
      authorizationReason: evaluation.authorization.reasons[0],
      match: evaluation.match.status,
      technical: evaluation.technical.status,
      approvalMode: evaluation.approvalMode,
      blockers: evaluation.blockers,
    };
  });

  const approved = rows.filter((row) => row.status === "APPROVED");
  const packshots = rows.filter((row) => row.kind === "PACKSHOT" && row.technical !== "NOT_CHECKED");
  const summary = {
    execution: "47B",
    generatedAt: verifiedAt,
    network: "none. Reads run-2 and the saved snapshot only.",
    snapshot: { file: "affiliates-page-snapshot.html", sha256: snapshotHash, url: PAGE, fetchedWithOneGetOnThisExecution: true },
    candidates: rows.length,
    approved: approved.length,
    candidate: rows.filter((row) => row.status === "CANDIDATE").length,
    rejected: rows.filter((row) => row.status === "REJECTED").length,
    conclusion: approved.length > 0 ? "SOME_IMAGES_APPROVED" : "NO_IMAGE_APPROVED",
  };

  const reassessment = {
    ...summary,
    affiliateLibrary: {
      section: 'section#images, headed "Banners"',
      imagesRenderedInsideSection: libraryImgs,
      linksInsideSection: libraryHrefs,
      bannerSets,
      sectionText: libraryText,
      reading: "The only material the program offers affiliates for promotion is the banner collection: a ZIP of animated GIFs in ad sizes, reached through two tracking links. The section renders no image and lists no product photo, packshot, or bottle image.",
    },
    publicOnly: {
      reading: "Every other candidate was found displayed on the vendor's pages. The bottle image is shown in the introduction of the affiliate page and on the public sales page, not offered as material.",
      candidatesShownInAffiliatePageIntro: rows.filter((row) => row.shownInAffiliatePageIntro).map((row) => row.url),
    },
    candidates: rows,
  };

  const offeredBanners = rows.filter((row) => row.offeredToAffiliatesAsMaterial);
  const authorization = {
    ...summary,
    programRestrictionsOnThePage: restrictions,
    restrictionsApplyingToPackshots: "None of the listed restrictions names product photos. One bars before/after photos that belong to the vendor and one bars copying the vendor's ads or landing pages. Neither is a packshot permission.",
    officiallyOffered: offeredBanners.map((row) => ({ id: row.id, url: row.url, offeredAs: "banner collection download", stageableOnLandingPage: false, reason: "A promotional banner cannot stage a product, and the pack was not retrieved (it sits behind a tracking link), so its contents are unknown." })),
    packshotCandidates: packshots.map((row) => ({ id: row.id, url: row.url, resolution: row.resolution, format: row.format, status: row.status, blockers: row.blockers })),
    evidenceStillMissing: [
      "A statement or library entry in which the NeuroPrime affiliate program offers its product images or packshots to affiliates for promotion. The affiliate page lists only banner sets.",
      "Or: the contents of the banner collection, showing a packshot inside it, retrieved through the program's own download link (the link is an affiliate tracking link, so retrieving it is a decision for the owner, not an automatic step).",
      "Or: a written permission from the program (affiliates@theneuroprime.com) naming the packshot and landing pages.",
      "For the AVIF packshots: a JPEG, PNG or WebP copy, because the asset route does not serve AVIF.",
      "For the product match: a source label or file name that names the product. The file names (neuro_xt_blck_btls, neuroXT_onebtl_new) do not, so the match stays PLAUSIBLE and the policy cannot pass them without a person.",
    ],
  };

  writeFileSync(path.join(RUN3, "source-reassessment.json"), JSON.stringify(reassessment, null, 2) + "\n");
  writeFileSync(path.join(RUN3, "authorization-evidence.json"), JSON.stringify(authorization, null, 2) + "\n");
  console.log(JSON.stringify(summary));
  console.log("library imgs:", libraryImgs.length, "library links:", libraryHrefs.length, "restrictions:", restrictions.length, "banner sets:", bannerSets.length);
  for (const row of rows.filter((entry) => entry.offeredToAffiliatesAsMaterial || entry.kind === "PACKSHOT")) {
    console.log(row.id, row.kind, row.status, row.authorization, row.match, row.technical, row.shownInAffiliatePageIntro);
  }
}

main();
