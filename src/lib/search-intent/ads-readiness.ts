import type { SalesCopy } from "@/lib/page-blueprint/types";
import type { ProductContract } from "@/lib/product-contract/types";
import { presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import type { AdsReadinessCheck, GoogleAdsReadiness } from "@/lib/search-intent/types";

const URGENCY = /\b(limited time|act now|only today|ends tonight|hurry)\b/i;
const REVIEW = /\b(verified buyer|★★|five stars|testimonial)\b/i;
const BADGE = /\b(fda[- ]approved|gmp certified|clinically certified|official seal)\b/i;
const OFFICIAL_SITE = /\bofficial (?:web)?site\b/i;
const PRICE = /\$\s*\d|\b\d+\s*%\s*off\b/;

function blobOf(copy: SalesCopy): string {
  return [
    copy.headline.text,
    copy.subheadline?.text,
    copy.introduction.text,
    ...copy.sections.flatMap((section) => [section.headline.text, ...section.body.map((item) => item.text), ...section.items.map((item) => item.text.text)]),
    ...copy.faq.flatMap((item) => [item.question.text, item.answer.text]),
    copy.cta.label?.text,
    copy.cta.caption?.text,
  ]
    .filter(Boolean)
    .join("\n");
}

function contractPrices(contract: ProductContract): string[] {
  return (contract.offer?.packages ?? [])
    .flatMap((item) => [item.totalPrice, item.unitPrice])
    .filter((item): item is string => Boolean(item));
}

/**
 * Readiness checks only. A pass is not Google Ads approval.
 */
export function evaluateGoogleAdsReadiness(contract: ProductContract, copy: SalesCopy): GoogleAdsReadiness {
  const text = blobOf(copy);
  const prices = contractPrices(contract);
  const mentioned = text.match(/\$\s*\d+(?:\.\d+)?/g) ?? [];
  const inventedPrice = mentioned.some((item) => !prices.some((price) => price.replace(/\s+/g, "") === item.replace(/\s+/g, "")));
  const hop = presellCtaAuthorization(contract);
  const legalLabels = contract.legal.trustLinks.map((item) => item.label.toLowerCase());
  const hasLegal =
    legalLabels.some((item) => /privacy/.test(item)) &&
    legalLabels.some((item) => /terms/.test(item)) &&
    Boolean(contract.legal.affiliateDisclosure.trim());
  const ownContent = copy.sections.some((section) => section.sectionType !== "legal" && section.sectionType !== "cta_final" && (section.body.length > 0 || section.items.length > 0));

  const checks: AdsReadinessCheck[] = [
    {
      id: "ADVERTISER_IDENTITY",
      verdict: contract.identity.productName ? "PASS" : "FAIL",
      reason: contract.identity.productName ? "The product identity is stated." : "No product identity is available.",
    },
    {
      id: "AFFILIATE_TRANSPARENCY",
      verdict: /affiliate|commission/i.test(contract.legal.affiliateDisclosure) ? "PASS" : "FAIL",
      reason: "Affiliate disclosure must remain visible.",
    },
    {
      id: "NO_MISLEADING_CLAIMS",
      verdict: OFFICIAL_SITE.test(text) ? "FAIL" : "PASS",
      reason: OFFICIAL_SITE.test(text)
        ? "The copy must not present this page as the official manufacturer website."
        : "The copy does not claim official-site status.",
    },
    {
      id: "NO_UNVERIFIED_PRICES",
      verdict: inventedPrice ? "FAIL" : "PASS",
      reason: inventedPrice ? "A price in the copy is not a verified package price." : "No unverified price was added.",
    },
    {
      id: "NO_FAKE_URGENCY",
      verdict: URGENCY.test(text) ? "FAIL" : "PASS",
      reason: URGENCY.test(text) ? "Urgency language is not allowed without a verified offer window." : "No fake urgency was added.",
    },
    {
      id: "NO_INVENTED_REVIEWS",
      verdict: REVIEW.test(text) ? "FAIL" : "PASS",
      reason: REVIEW.test(text) ? "Testimonials and star ratings were not independently verified." : "No invented reviews were added.",
    },
    {
      id: "NO_UNVERIFIED_BADGES",
      verdict: BADGE.test(text) ? "FAIL" : "PASS",
      reason: BADGE.test(text) ? "Certification badges are not in the contract." : "No unverified seals were added.",
    },
    {
      id: "LEGAL_LINKS",
      verdict: hasLegal ? "PASS" : "FAIL",
      reason: hasLegal ? "Required legal links and disclosure are present." : "Required legal links or disclosure are missing.",
    },
    {
      id: "OWN_CONTENT",
      verdict: ownContent ? "PASS" : "FAIL",
      reason: ownContent ? "The page carries its own grounded information." : "A page that only redirects is not sufficient.",
    },
    {
      id: "COMMERCIAL_DESTINATION",
      verdict: hop.status === "AUTHORIZED" ? "PASS" : hop.status === "BLOCKED_PLACEHOLDER" ? "FAIL" : "NOT_EVALUATED",
      reason:
        hop.status === "AUTHORIZED"
          ? "An authorized destination is available."
          : hop.status === "BLOCKED_PLACEHOLDER"
            ? "A placeholder hop is not a commercial destination."
            : "No authorized hop is present. The commercial CTA stays inactive.",
    },
  ];

  return {
    certified: false,
    disclaimer: "These checks are readiness signals. They are not Google Ads approval or guaranteed compliance.",
    checks,
  };
}
