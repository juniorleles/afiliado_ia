/**
 * Policy Linter V2 — internal pre-publication risk gate.
 *
 * This is NOT Google/Meta approval. It does not claim compliance, safety
 * from suspension, or that an ad will be approved. Human review remains
 * required. Findings are heuristics and can be wrong in both directions.
 */

import type { Campaign } from "@/lib/campaigns";
import { parseMarkdown } from "@/lib/markdown";
import { AFFILIATE_CTA_REL, PUBLIC_FOOTER_LINKS } from "@/lib/public-site";
import { SLUG_PATTERN } from "@/lib/slug";
import { LINT_THRESHOLDS } from "@/lib/policy-linter-thresholds";

export const LINTER_VERSION = "v2";

export type LintStatus = "pass" | "warn" | "fail";
export type PublicationGate = "READY" | "REVIEW_REQUIRED" | "BLOCKED";

export type LintCategory =
  | "DESTINATION_INTEGRITY"
  | "AFFILIATE_TRANSPARENCY"
  | "HEALTH_AND_SENSITIVE_CLAIMS"
  | "UNVERIFIABLE_CLAIMS"
  | "AD_LANDING_CONSISTENCY"
  | "CONTENT_QUALITY"
  | "CTA_AND_LINKS"
  | "TRUST_AND_SITE_STRUCTURE"
  | "LANGUAGE_QUALITY";

export type LintRuleFinding = {
  category: LintCategory;
  ruleId: string;
  status: LintStatus;
  message: string;
  evidence?: string;
  suggestion?: string;
  blocking: boolean;
};

export type LintContext = {
  disclosureAlwaysRendered: boolean;
  affiliateCtaRel: string;
  publicTrustPaths: readonly string[];
  sameTabCta: boolean;
  noAutoRedirect: boolean;
  noCrawlerBranching: boolean;
};

export const DEFAULT_LINT_CONTEXT: LintContext = {
  disclosureAlwaysRendered: true,
  affiliateCtaRel: AFFILIATE_CTA_REL,
  publicTrustPaths: PUBLIC_FOOTER_LINKS.map((l) => l.href),
  sameTabCta: true,
  noAutoRedirect: true,
  noCrawlerBranching: true,
};

export const CATEGORY_LABELS: Record<LintCategory, string> = {
  DESTINATION_INTEGRITY: "Destination Integrity",
  AFFILIATE_TRANSPARENCY: "Affiliate Transparency",
  HEALTH_AND_SENSITIVE_CLAIMS: "Health & Sensitive Claims",
  UNVERIFIABLE_CLAIMS: "Unverifiable Claims",
  AD_LANDING_CONSISTENCY: "Ad ↔ Landing Consistency",
  CONTENT_QUALITY: "Content Quality",
  CTA_AND_LINKS: "CTA and Links",
  TRUST_AND_SITE_STRUCTURE: "Trust and Site Structure",
  LANGUAGE_QUALITY: "Language Quality",
};

export type LintResult = {
  version: typeof LINTER_VERSION;
  findings: LintRuleFinding[];
  gate: PublicationGate;
  /** Legacy 0–100 heuristic. Not the publication decision. */
  legacyRiskScore: number;
  /** Alias of legacyRiskScore for older callers. */
  score: number;
};

// --- helpers ---

const PT_LETTER_CLASS = "a-zà-öø-ÿ";

function portugueseWordBoundary(word: string): RegExp {
  return new RegExp(`(?<![${PT_LETTER_CLASS}])${word}(?![${PT_LETTER_CLASS}])`, "i");
}

function wordBoundaryPattern(source: string, flags = "i"): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, flags);
}

/**
 * A refund window and the refund term do not have to be adjacent: copy writes
 * "60-day 100% money-back guarantee" and "money-back guarantee for 60 days" as
 * often as "60-day guarantee". The rule stays a duration rule, so a duration
 * alone or a refund term alone still passes.
 */
function refundDurationPattern(): RegExp {
  const duration = "\\d+\\s*[- ]?(?:day|days|week|weeks|month|months)";
  const term = "(?:refunds?|money[- ]?back|guarantees?|warrant(?:y|ies))";
  const near = "[^.\\n]{0,40}?";
  return new RegExp(
    `(?<![a-z0-9])(?:${duration}${near}${term}|${term}${near}${duration}|(?:refund|money[- ]?back|guarantee)\\s+policy)(?![a-z0-9])`,
    "i",
  );
}

function collectMatches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.push(match[0]);
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return found;
}

function uniqueJoin(items: string[]): string {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].join("; ");
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "does", "do", "did", "this",
  "that", "it", "to", "of", "in", "on", "for", "with", "and", "or", "but",
  "you", "your", "actually", "really", "from", "into", "about", "than",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

function copyText(campaign: Campaign): string {
  return `${campaign.headline}\n${campaign.body}\n${campaign.ctaLabel}`;
}

function pass(category: LintCategory, ruleId: string, message: string): LintRuleFinding {
  return { category, ruleId, status: "pass", message, blocking: false };
}

function warn(
  category: LintCategory,
  ruleId: string,
  message: string,
  extra: { evidence?: string; suggestion?: string } = {},
): LintRuleFinding {
  return { category, ruleId, status: "warn", message, blocking: false, ...extra };
}

function fail(
  category: LintCategory,
  ruleId: string,
  message: string,
  extra: { evidence?: string; suggestion?: string; blocking?: boolean } = {},
): LintRuleFinding {
  const { blocking = true, ...rest } = extra;
  return { category, ruleId, status: "fail", message, blocking, ...rest };
}

function publicationGate(findings: LintRuleFinding[]): PublicationGate {
  if (findings.some((f) => f.status === "fail" && f.blocking)) return "BLOCKED";
  if (findings.some((f) => f.status !== "pass")) return "REVIEW_REQUIRED";
  return "READY";
}

function legacyRiskScore(findings: LintRuleFinding[]): number {
  if (findings.length === 0) return 100;
  const points = findings.reduce((sum, f) => {
    if (f.status === "pass") return sum + 1;
    if (f.status === "warn") return sum + 0.4;
    return sum;
  }, 0);
  return Math.round((points / findings.length) * 100);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// --- category A ---

function checkDestination(campaign: Campaign, ctx: LintContext): LintRuleFinding[] {
  const findings: LintRuleFinding[] = [];

  if (!campaign.slug || !SLUG_PATTERN.test(campaign.slug)) {
    findings.push(
      fail("DESTINATION_INTEGRITY", "dest.slug_valid", "Public slug is missing or not URL-safe.", {
        evidence: campaign.slug || "(empty)",
        suggestion: "Use lowercase letters, numbers, and hyphens only (example: winter-jacket-review).",
      }),
    );
  } else {
    findings.push(pass("DESTINATION_INTEGRITY", "dest.slug_valid", `Public path is /p/${campaign.slug}.`));
  }

  if (ctx.noAutoRedirect) {
    findings.push(
      pass(
        "DESTINATION_INTEGRITY",
        "dest.no_auto_redirect",
        "No automatic redirect is configured; the visitor stays on the presell until they click.",
      ),
    );
  } else {
    findings.push(
      fail("DESTINATION_INTEGRITY", "dest.no_auto_redirect", "Automatic redirect configuration is present.", {
        suggestion: "Remove any auto-redirect. Affiliate hops must be an explicit click.",
      }),
    );
  }

  if (ctx.noCrawlerBranching) {
    findings.push(
      pass(
        "DESTINATION_INTEGRITY",
        "dest.no_alternate_destination",
        "No crawler/reviewer/user-agent branching is configured for public pages.",
      ),
    );
  } else {
    findings.push(
      fail(
        "DESTINATION_INTEGRITY",
        "dest.no_alternate_destination",
        "Alternate destination behavior by traffic source is configured.",
        { suggestion: "Serve the same URL and content to ads, visitors, and reviewers." },
      ),
    );
  }

  findings.push(
    pass(
      "DESTINATION_INTEGRITY",
      "dest.public_page",
      "When published, /p/[slug] serves this template to every visitor. Drafts are not public.",
    ),
  );

  return findings;
}

// --- category B ---

function checkAffiliateTransparency(campaign: Campaign, ctx: LintContext): LintRuleFinding[] {
  const findings: LintRuleFinding[] = [];
  const text = copyText(campaign);

  if (!ctx.disclosureAlwaysRendered) {
    findings.push(
      fail(
        "AFFILIATE_TRANSPARENCY",
        "aff.disclosure_visible",
        "Affiliate disclosure is not visible on the public review.",
        {
          suggestion: "Keep the template disclosure always visible. Do not hide the commercial relationship.",
        },
      ),
    );
  } else {
    findings.push(
      pass(
        "AFFILIATE_TRANSPARENCY",
        "aff.disclosure_visible",
        "Affiliate disclosure is always rendered on the public review template.",
      ),
    );
  }

  const hasDisclosurePage = ctx.publicTrustPaths.includes("/affiliate-disclosure");
  findings.push(
    hasDisclosurePage
      ? pass("AFFILIATE_TRANSPARENCY", "aff.global_disclosure_page", "Global /affiliate-disclosure page is part of the public site.")
      : fail("AFFILIATE_TRANSPARENCY", "aff.global_disclosure_page", "Global affiliate disclosure page is not registered.", {
          suggestion: "Keep /affiliate-disclosure in the public footer.",
        }),
  );

  const ctaLooksLikeLink = campaign.ctaLabel.trim().length > 0;
  findings.push(
    ctaLooksLikeLink
      ? pass("AFFILIATE_TRANSPARENCY", "aff.cta_identifiable", `CTA label is visible: "${campaign.ctaLabel.trim()}".`)
      : fail("AFFILIATE_TRANSPARENCY", "aff.cta_identifiable", "CTA label is empty, so the outbound action is not identifiable.", {
          suggestion: "Use a clear action label such as Check current price.",
        }),
  );

  const relHasSponsored = /\bsponsored\b/i.test(ctx.affiliateCtaRel);
  findings.push(
    relHasSponsored
      ? pass("AFFILIATE_TRANSPARENCY", "aff.rel_sponsored", `CTA rel includes sponsored (${ctx.affiliateCtaRel}).`)
      : fail("AFFILIATE_TRANSPARENCY", "aff.rel_sponsored", "CTA rel does not include sponsored.", {
          suggestion: 'Keep rel="nofollow sponsored" on affiliate CTAs.',
        }),
  );

  const hiding = collectMatches(
    text,
    wordBoundaryPattern("not an affiliate|not sponsored|not an advertisement|no affiliate links"),
  );
  if (hiding.length > 0) {
    findings.push(
      fail("AFFILIATE_TRANSPARENCY", "aff.not_hidden", "Copy appears to deny the affiliate relationship.", {
        evidence: uniqueJoin(hiding),
        suggestion: "Do not contradict the disclosure. State that links may earn a commission.",
      }),
    );
  } else {
    findings.push(pass("AFFILIATE_TRANSPARENCY", "aff.not_hidden", "Copy does not deny the affiliate relationship."));
  }

  return findings;
}

// --- category C + D (pattern tables) ---

type ClaimPattern = {
  ruleId: string;
  category: LintCategory;
  pattern: RegExp;
  message: string;
  suggestion: string;
  blocking: boolean;
  /** Default fail. Warn still prevents READY via REVIEW_REQUIRED. */
  level?: "fail" | "warn";
};

const ATTRIBUTION_CUE =
  /according to .{0,80}(website|seller|manufacturer|merchant|product page|listing)|the product(?:'s)? website states|the seller (?:states|claims|says|describes)|as (?:stated|described|claimed) (?:on|by) (?:the )?(?:product|seller|manufacturer|website)|the manufacturer (?:states|claims|says)/i;

function sentenceContaining(text: string, matchIndex: number, matchText: string): string {
  const start = Math.max(0, text.lastIndexOf(".", matchIndex) + 1);
  const after = text.indexOf(".", matchIndex + matchText.length);
  const end = after >= 0 ? after + 1 : Math.min(text.length, matchIndex + 220);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

const FDA_STYLE_DISCLAIMER =
  /\b(?:(?:is |are )?not intended to diagnose|does not claim to (?:diagnose|treat|cure|prevent)|does not (?:diagnose|treat|cure|prevent))(?:[,\s]+(?:treat|cure|or prevent|prevent|any disease))+/i;
const FDA_STYLE_DISCLAIMER_GLOBAL =
  /\b(?:(?:is |are )?not intended to diagnose|does not claim to (?:diagnose|treat|cure|prevent)|does not (?:diagnose|treat|cure|prevent))(?:[,\s]+(?:treat|cure|or prevent|prevent|any disease))+/gi;
const AFFIRMATIVE_CURE =
  /\bcure[sd]?\b|\bheal[s]?\b|\bmiracle\b|\beliminate(?:s|d)? disease\b|\breverse(?:s|d)? disease\b/i;

/**
 * FDA-style negated disclaimer is not a cure claim. A nearby "not" is not
 * enough — leftover affirmative cure language still fails.
 */
function isFdaStyleDisclaimerWithoutAffirmativeCure(sentence: string): boolean {
  if (!FDA_STYLE_DISCLAIMER.test(sentence)) return false;
  const stripped = sentence.replace(FDA_STYLE_DISCLAIMER_GLOBAL, " ");
  return !AFFIRMATIVE_CURE.test(stripped);
}

export function isAttributedSellerClaim(sentence: string): boolean {
  return ATTRIBUTION_CUE.test(sentence);
}

const HEALTH_OBJECT =
  "(?:immune(?:\\s+(?:system|function|health|support))?|respiratory(?:\\s+health)?|sinus(?:es| health)?|inflammation|inflammatory|microbiome|oral tissue|gums?|coloniz(?:e|ation)|bacteria in (?:the )?mouth)";

const HEALTH_PATTERNS: ClaimPattern[] = [
  {
    ruleId: "health.cure",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern("cure[sd]?|heal[s]?|miracle|eliminate(?:s|d)? disease|reverse(?:s|d)? disease"),
    message: "Cure/treatment language — internal advertising risk, not a platform verdict. FDA-style negated disclaimers are excluded; a bare 'not' is not.",
    suggestion: "Describe the product factually. Do not claim it cures, heals, or reverses disease.",
    blocking: true,
  },
  {
    ruleId: "health.treat",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern("treats? (?:cancer|arthritis|disease|diabetes|depression)|treatment for (?:cancer|arthritis|disease)"),
    message: "Treatment claim aimed at a medical condition.",
    suggestion: "Avoid disease-treatment wording unless you store verified evidence (not supported in this schema).",
    blocking: true,
  },
  {
    ruleId: "health.time_bound",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern:
      /(?:lose|lost)\s+\d+\s*(?:kg|kgs|lbs?|pounds?)\s+in\s+\d+\s+(?:days?|weeks?)|(?:results?|pain gone|pain[- ]free|eliminates?\s+pain)\s+in\s+\d+\s+(?:days?|weeks?)|\d+\s*(?:kg|lbs?|pounds?)\s+per\s+week/i,
    message: "Time-bound health or weight outcome — high internal risk.",
    suggestion: "Remove specific timelines for pain, weight, or results unless independently verified.",
    blocking: true,
  },
  {
    ruleId: "health.authority",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern("fda[\\s-]?approved|doctor[s]? approved|clinically proven|scientifically proven|scientifically verified"),
    message: "Authority/medical-proof claim without a stored evidence source.",
    suggestion: "Do not claim FDA approval, clinical proof, or doctor approval unless you can document it on the page.",
    blocking: true,
  },
  {
    ruleId: "health.guarantee",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "guaranteed results|guaranteed to (?:work|cure|fix|lose|heal)|works for everyone|100%\\s+(?:effective|guaranteed|safe)|permanent results|risk[- ]free results?",
    ),
    message: "Guaranteed or universal outcome claim.",
    suggestion: "Use non-guaranteed wording. Readers differ; products do not work for everyone.",
    blocking: true,
  },
  {
    ruleId: "health.inflammation",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "natural anti-inflammatory|anti-inflammatory|help(?:s|ing)? manage inflammation|manage inflammation|reduc(?:e|es|ing) inflammation",
    ),
    message: "Inflammation/anti-inflammatory claim — softening language does not make this a verified fact.",
    suggestion: "Omit, or attribute as a seller statement without converting it into an editorial fact.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.immune",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "(?:may |might |can |could |potential(?:ly)? )?(?:support|supports|help|helps|helping)(?:s)? immune(?: system| function| health)?|immune function|immune system support|supports immune",
    ),
    message: "Immune-system claim. Seller provenance is not independent verification.",
    suggestion: "Do not state immune effects as editorial fact. Attribute or omit.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.respiratory",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "(?:support|supports|help|helps)(?:s)? respiratory health|respiratory health support|sinus support|(?:support|supports) sinuses",
    ),
    message: "Respiratory or sinus-effect claim.",
    suggestion: "Omit unsourced respiratory/sinus effects, or attribute them as seller claims.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.mechanism",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "intended to colonize|designed to colonize|colonize (?:the )?(?:mouth|gut|oral|digestive)|support oral tissue health|oral tissue health",
    ),
    message: "Biological-mechanism or tissue-health claim.",
    suggestion: "Do not describe colonization or tissue effects as established science unless stored as a sourced, attributed seller statement.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.research_language",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "research (?:shows|suggests|indicates|demonstrates)|studies (?:show|suggest|demonstrate)|evidence (?:shows|suggests)",
    ),
    message: "Research-substantiation language. Attribution does not equal independent verification.",
    suggestion: "Remove research/study wording unless the supplied facts include that exact sourced claim, then attribute it.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.safety_general",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "generally (?:considered )?safe(?: for healthy (?:individuals|adults|people))?|safe for healthy (?:individuals|adults|people)",
    ),
    message: "General supplement-safety claim — not ordinary product facts.",
    suggestion: "Do not invent safety advice. Leave suitability to the reader and the merchant.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.drug_interaction",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "interact(?:s|ing)? with (?:certain )?(?:medications?|drugs?|prescriptions?)|drug interaction",
    ),
    message: "Medication-interaction claim. Independent medical advice is high risk.",
    suggestion: "Do not invent drug-interaction guidance. If the source warns about it, attribute the warning.",
    blocking: true,
  },
  {
    ruleId: "health.consult_professional",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern(
      "consult(?: with)?(?: your)? (?:doctor|physician|healthcare professional|healthcare provider|health care professional|health care provider)",
    ),
    message:
      "Defense-in-depth: consult-professional language always WARNs for operator review. Grounding remains the factual authority — a sourced caution can be GROUNDED while this policy warning remains. WARN is not a grounding failure.",
    suggestion: "Omit doctor/healthcare consultation language unless copy-eligible cautions state it, then keep the wording conservative.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.pregnancy_nursing",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern("pregnant|pregnancy|nursing|breastfeeding|breast feeding"),
    message: "Pregnancy/nursing caution without a dedicated evidence check at policy layer.",
    suggestion: "Omit pregnancy/nursing warnings unless copy-eligible cautions state them.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.medication_advice",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: wordBoundaryPattern("medications?|prescriptions?|medical treatment"),
    message:
      "Defense-in-depth: medication language always WARNs for operator review. Grounding remains the factual authority — a sourced caution can be GROUNDED while this policy warning remains. WARN is not a grounding failure.",
    suggestion: "Do not invent medication cautions. Leave medical treatment to sourced warnings.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.refund_duration",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: refundDurationPattern(),
    message:
      "Defense-in-depth review: a stated refund duration requires operator review even when Grounding supports the same window. This does not mean the duration itself is fabricated; Grounding remains the factual authority.",
    suggestion: "Do not invent refund windows. Restate only copy-eligible guarantee evidence.",
    blocking: false,
    level: "warn",
  },
  {
    ruleId: "health.support_effect",
    category: "HEALTH_AND_SENSITIVE_CLAIMS",
    pattern: new RegExp(
      `(?<![a-z0-9])(?:may |might |can |could |potential(?:ly)? )?(?:support|supports|help|helps|designed to support|intended to support)\\s+${HEALTH_OBJECT}(?![a-z0-9])`,
      "i",
    ),
    message: "Health-effect 'supports/helps' claim. Softening (may/can/designed to) does not make it safe.",
    suggestion: "Restate only documented product facts, or attribute seller health claims clearly.",
    blocking: false,
    level: "warn",
  },
];

const UNVERIFIABLE_PATTERNS: ClaimPattern[] = [
  {
    ruleId: "unv.rank",
    category: "UNVERIFIABLE_CLAIMS",
    pattern: /#\s*1\b|\bnumber[- ]one\b|\bbest product\b|\bmost effective\b|\bhighest rated\b/i,
    message: "Ranking/superlative claim with no evidence/source field on the campaign.",
    suggestion: "Drop #1 / best / highest-rated language, or wait for a future evidence/source model.",
    blocking: true,
  },
  {
    ruleId: "unv.volume",
    category: "UNVERIFIABLE_CLAIMS",
    pattern: wordBoundaryPattern("thousands of doctors recommend|millions of customers|award[- ]winning"),
    message: "Volume or award claim with no stored source.",
    suggestion: "Do not invent customer counts, doctor recommendations, or awards.",
    blocking: true,
  },
  {
    ruleId: "unv.clinical",
    category: "UNVERIFIABLE_CLAIMS",
    pattern: wordBoundaryPattern("clinically proven|scientifically proven"),
    message: "Proof-language without a campaign evidence model.",
    suggestion: "Remove proof claims until a source can be stored and shown.",
    blocking: true,
  },
];

function runClaimPatterns(text: string, patterns: ClaimPattern[]): LintRuleFinding[] {
  return patterns.map((rule) => {
    const hits = collectMatches(text, rule.pattern).filter((hit) => {
      if (rule.ruleId !== "health.cure") return true;
      const idx = text.toLowerCase().indexOf(hit.toLowerCase());
      const sentence = idx >= 0 ? sentenceContaining(text, idx, hit) : hit;
      return !isFdaStyleDisclaimerWithoutAffirmativeCure(sentence);
    });
    if (hits.length === 0) {
      return pass(rule.category, rule.ruleId, "No match for this internal risk pattern.");
    }

    const sentences = hits.map((hit) => {
      const idx = text.toLowerCase().indexOf(hit.toLowerCase());
      return idx >= 0 ? sentenceContaining(text, idx, hit) : hit;
    });
    const anyIndependent = sentences.some((s) => !isAttributedSellerClaim(s));
    const anyAttributed = sentences.some((s) => isAttributedSellerClaim(s));
    const evidence = uniqueJoin(hits);

    if (rule.blocking) {
      return fail(rule.category, rule.ruleId, rule.message, {
        evidence,
        suggestion: anyAttributed
          ? `${rule.suggestion} Attribution to the seller/website does not make this claim acceptable.`
          : rule.suggestion,
        blocking: true,
      });
    }

    const level = rule.level ?? "fail";
    const attributionNote = anyAttributed
      ? anyIndependent
        ? " Includes an attributed seller claim; attribution is not independent verification."
        : " Wording is attributed to the seller/website; attribution is not independent verification."
      : "";

    if (level === "warn") {
      return warn(rule.category, rule.ruleId, `${rule.message}${attributionNote}`, {
        evidence,
        suggestion: rule.suggestion,
      });
    }

    return fail(rule.category, rule.ruleId, `${rule.message}${attributionNote}`, {
      evidence,
      suggestion: rule.suggestion,
      blocking: false,
    });
  });
}

// --- category E ---

function checkAdConsistency(campaign: Campaign): LintRuleFinding[] {
  if (!campaign.adHeadline || campaign.adHeadline.trim() === "") {
    return [
      pass(
        "AD_LANDING_CONSISTENCY",
        "ad.headline_present",
        "No separate ad headline stored — assuming the ad uses the presell headline.",
      ),
    ];
  }

  const ad = campaign.adHeadline.trim();
  const page = `${campaign.headline}\n${campaign.body}`;
  const adWords = tokenize(ad);
  const pageWords = tokenize(page);
  const shared = [...adWords].filter((w) => pageWords.has(w));
  const overlap = adWords.size === 0 ? 0 : shared.length / adWords.size;

  const strongInAd = [
    ...collectMatches(ad, HEALTH_PATTERNS[3].pattern),
    ...collectMatches(ad, HEALTH_PATTERNS[4].pattern),
    ...collectMatches(ad, UNVERIFIABLE_PATTERNS[0].pattern),
  ];
  const strongMissingOnPage = strongInAd.filter((hit) => !page.toLowerCase().includes(hit.toLowerCase()));

  const findings: LintRuleFinding[] = [];

  if (overlap < LINT_THRESHOLDS.adConsistency.minOverlapFail) {
    findings.push(
      fail("AD_LANDING_CONSISTENCY", "ad.topic_overlap", "Ad headline looks unrelated to the landing page topics.", {
        evidence: `ad="${ad}" vs page="${campaign.headline}" (overlap ${Math.round(overlap * 100)}%)`,
        suggestion: "Align the ad promise with the product and sections on this presell.",
      }),
    );
  } else if (overlap < LINT_THRESHOLDS.adConsistency.minOverlapPass) {
    findings.push(
      warn("AD_LANDING_CONSISTENCY", "ad.topic_overlap", "Low keyword overlap between ad headline and page.", {
        evidence: `overlap ${Math.round(overlap * 100)}%`,
        suggestion: "Check that the ad and page describe the same product and benefit.",
      }),
    );
  } else {
    findings.push(
      pass("AD_LANDING_CONSISTENCY", "ad.topic_overlap", `Ad/page token overlap ${Math.round(overlap * 100)}% (heuristic).`),
    );
  }

  if (strongMissingOnPage.length > 0) {
    findings.push(
      fail("AD_LANDING_CONSISTENCY", "ad.promise_mismatch", "Strong claim appears in the ad headline but not on the page.", {
        evidence: uniqueJoin(strongMissingOnPage),
        suggestion: "Do not advertise a proof or ranking claim the landing page does not discuss.",
      }),
    );
  } else {
    findings.push(pass("AD_LANDING_CONSISTENCY", "ad.promise_mismatch", "No extra strong proof/ranking claim only in the ad headline."));
  }

  return findings;
}

// --- category F ---

function checkContentQuality(campaign: Campaign): LintRuleFinding[] {
  const findings: LintRuleFinding[] = [];
  const words = wordCount(`${campaign.headline} ${campaign.body}`);
  const blocks = parseMarkdown(campaign.body);
  const headings = blocks.filter((b) => b.type === "heading");
  const paragraphs = blocks.filter((b) => b.type === "paragraph");
  const { minWordsFail, minWordsWarn, minHeadingsWarn, publicCtaCount, maxCtasPerHundredWordsWarn } =
    LINT_THRESHOLDS.content;

  if (words < minWordsFail) {
    findings.push(
      fail("CONTENT_QUALITY", "content.word_count", "Internal thin-content risk: almost no copy on the page.", {
        evidence: `${words} words (fail below ${minWordsFail})`,
        suggestion: "Add informational sections (what it is, who it is for, caveats, FAQ). Do not ship a link-only page.",
      }),
    );
  } else if (words < minWordsWarn) {
    findings.push(
      warn("CONTENT_QUALITY", "content.word_count", "Internal thin-content risk: copy is short for a standalone review.", {
        evidence: `${words} words (warn below ${minWordsWarn})`,
        suggestion: "Expand with useful, non-invented product information.",
      }),
    );
  } else {
    findings.push(pass("CONTENT_QUALITY", "content.word_count", `${words} words — above the thin-content warn threshold.`));
  }

  const ctasPerHundred = words === 0 ? 99 : (publicCtaCount / words) * 100;
  if (ctasPerHundred >= maxCtasPerHundredWordsWarn) {
    findings.push(
      warn("CONTENT_QUALITY", "content.cta_density", "Internal thin-content risk: CTA density is high relative to copy length.", {
        evidence: `${publicCtaCount} template CTAs / ${words} words`,
        suggestion: "Add substance so the page is not primarily outbound buttons.",
      }),
    );
  } else {
    findings.push(pass("CONTENT_QUALITY", "content.cta_density", "CTA count vs copy length is within the internal threshold."));
  }

  if (headings.length < minHeadingsWarn && paragraphs.length < 2) {
    findings.push(
      warn("CONTENT_QUALITY", "content.sections", "Few informational sections — page may read as a bridge to the hop.", {
        evidence: `${headings.length} headings, ${paragraphs.length} paragraphs`,
        suggestion: "Use a few real ## sections (features, caveats, FAQ). Empty headings do not count as content.",
      }),
    );
  } else {
    findings.push(pass("CONTENT_QUALITY", "content.sections", "Page has some structured informational blocks."));
  }

  const sentences = campaign.body
    .split(/[.!\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 40);
  const dup = sentences.find((s, i) => sentences.indexOf(s) !== i);
  if (dup) {
    findings.push(
      warn("CONTENT_QUALITY", "content.repetition", "Repeated promotional sentence detected.", {
        evidence: dup.slice(0, 120),
        suggestion: "Remove duplicated hype; keep one clear explanation.",
      }),
    );
  } else {
    findings.push(pass("CONTENT_QUALITY", "content.repetition", "No long duplicated sentence detected."));
  }

  return findings;
}

// --- category G ---

function checkCtaAndLinks(campaign: Campaign, ctx: LintContext): LintRuleFinding[] {
  const findings: LintRuleFinding[] = [];
  const url = campaign.affiliateUrl.trim();

  if (/^javascript:/i.test(url) || /^data:/i.test(url)) {
    findings.push(
      fail("CTA_AND_LINKS", "cta.not_javascript", "Affiliate URL uses a javascript: or data: scheme.", {
        evidence: url.slice(0, 80),
        suggestion: "Use a normal https destination. Never javascript: URLs.",
      }),
    );
  } else {
    findings.push(pass("CTA_AND_LINKS", "cta.not_javascript", "Affiliate URL is not a javascript: or data: scheme."));
  }

  if (!url || !isHttpUrl(url)) {
    findings.push(
      fail("CTA_AND_LINKS", "cta.http_url", "Affiliate URL is missing or is not a valid http(s) URL.", {
        evidence: url || "(empty)",
        suggestion: "Set a full https:// affiliate hop URL.",
      }),
    );
  } else {
    findings.push(pass("CTA_AND_LINKS", "cta.http_url", "Affiliate URL is http(s)."));
  }

  findings.push(
    pass("CTA_AND_LINKS", "cta.real_anchor", "Public CTAs are real <a> elements (template), not a scripted redirect."),
  );

  findings.push(
    ctx.sameTabCta
      ? pass("CTA_AND_LINKS", "cta.same_tab", "Affiliate CTAs navigate in the same tab by default.")
      : warn("CTA_AND_LINKS", "cta.same_tab", "CTA is not configured for same-tab navigation."),
  );

  findings.push(
    ctx.noAutoRedirect
      ? pass("CTA_AND_LINKS", "cta.no_auto_redirect", "No automatic redirect on page load.")
      : fail("CTA_AND_LINKS", "cta.no_auto_redirect", "Automatic redirect is configured."),
  );

  findings.push(
    pass(
      "CTA_AND_LINKS",
      "cta.tracking_propagation",
      "UTM/gclid/fbclid/msclkid propagation remains implemented on affiliate hrefs.",
    ),
  );

  if (/\bofficial\s+(?:web\s*)?site\b/i.test(campaign.ctaLabel)) {
    findings.push(
      fail("CTA_AND_LINKS", "cta.official_authority", "CTA implies an official website without a facts-aware identity check at this layer.", {
        evidence: campaign.ctaLabel,
        suggestion: "Use Learn More, View Product Details, or Check Current Details unless manufacturer/brand identity is copy-eligible.",
        blocking: true,
      }),
    );
  } else {
    findings.push(pass("CTA_AND_LINKS", "cta.official_authority", "CTA does not imply an unconfirmed official website."));
  }

  return findings;
}

// --- category H ---

function checkTrustStructure(ctx: LintContext): LintRuleFinding[] {
  const required = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure"];
  const missing = required.filter((path) => !ctx.publicTrustPaths.includes(path));
  if (missing.length > 0) {
    return [
      fail("TRUST_AND_SITE_STRUCTURE", "trust.pages", "Required public trust routes are not registered in application state.", {
        evidence: missing.join(", "),
        suggestion: "Keep Phase 1 routes in PUBLIC_FOOTER_LINKS.",
      }),
    ];
  }
  return [
    pass(
      "TRUST_AND_SITE_STRUCTURE",
      "trust.pages",
      "About, Contact, Privacy, Terms, and Affiliate Disclosure routes are registered and linked from the public footer.",
    ),
  ];
}

// --- category I ---

const PORTUGUESE_WORDS = ["você", "não", "para", "está", "com", "mais", "também", "então", "muito", "aqui"];

/** URLs, emails and domain names are identifiers, not natural-language tokens. */
const ADDRESS_SPAN =
  /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+|[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}\b(?:\/[^\s<>"')\]]*)?/gi;

export function withoutAddressSpans(text: string): string {
  return text.replace(ADDRESS_SPAN, " ");
}

function checkLanguage(campaign: Campaign): LintRuleFinding[] {
  const findings: LintRuleFinding[] = [];
  const combined = withoutAddressSpans(`${campaign.headline}\n${campaign.body}`);
  const ptHits: string[] = [];
  if (/[áàâãéêíóôõúç]/i.test(combined)) {
    const accent = combined.match(/[áàâãéêíóôõúç]/i);
    if (accent) ptHits.push(accent[0]);
  }
  for (const word of PORTUGUESE_WORDS) {
    const matches = collectMatches(combined, portugueseWordBoundary(word));
    ptHits.push(...matches);
  }
  if (ptHits.length > 0) {
    findings.push(
      fail("LANGUAGE_QUALITY", "lang.portuguese", "Portuguese leakage in an English-only presell.", {
        evidence: uniqueJoin(ptHits),
        suggestion: "Rewrite headline/body in native English. Do not mix PT copy.",
      }),
    );
  } else {
    findings.push(pass("LANGUAGE_QUALITY", "lang.portuguese", "No Portuguese word-boundary or accent leakage detected."));
  }

  const blocks = parseMarkdown(campaign.body);
  const headings = blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
  const emptyHeading = headings.find((h) => h.trim() === "");
  if (emptyHeading !== undefined) {
    findings.push(
      warn("LANGUAGE_QUALITY", "lang.empty_sections", "Empty ## heading with no title text.", {
        suggestion: "Remove empty headings or give them a real section name.",
      }),
    );
  } else {
    findings.push(pass("LANGUAGE_QUALITY", "lang.empty_sections", "No empty section headings."));
  }

  const lowerHeadings = headings.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const dupHeading = lowerHeadings.find((h, i) => lowerHeadings.indexOf(h) !== i);
  if (dupHeading) {
    findings.push(
      warn("LANGUAGE_QUALITY", "lang.duplicate_headings", "Duplicated section heading.", {
        evidence: dupHeading,
        suggestion: "Use each section title once.",
      }),
    );
  } else {
    findings.push(pass("LANGUAGE_QUALITY", "lang.duplicate_headings", "No duplicated headings."));
  }

  const punct = combined.match(/!{4,}|\?{4,}/);
  if (punct) {
    findings.push(
      warn("LANGUAGE_QUALITY", "lang.punctuation", "Excessive repeated punctuation.", {
        evidence: punct[0],
        suggestion: "Tone down punctuation; it reads like spam.",
      }),
    );
  } else {
    findings.push(pass("LANGUAGE_QUALITY", "lang.punctuation", "No excessive repeated punctuation."));
  }

  const placeholders = collectMatches(
    combined,
    /\[PRODUCT NAME\]|INSERT HERE|Lorem ipsum|TODO\b|TBD\b/gi,
  );
  if (placeholders.length > 0) {
    findings.push(
      fail("LANGUAGE_QUALITY", "lang.placeholder", "Placeholder/AI stub text left in the presell.", {
        evidence: uniqueJoin(placeholders),
        suggestion: "Replace stubs with real English copy before using the public URL.",
        blocking: true,
      }),
    );
  } else {
    findings.push(pass("LANGUAGE_QUALITY", "lang.placeholder", "No placeholder stubs ([PRODUCT NAME], Lorem ipsum, TODO)."));
  }

  return findings;
}

/**
 * Statement-level health / unverifiable scan. Reuses the campaign claim
 * patterns; does not add, remove, or soften any rule.
 */
export function lintSourceStatement(text: string): LintRuleFinding[] {
  return [
    ...runClaimPatterns(text, HEALTH_PATTERNS),
    ...runClaimPatterns(text, UNVERIFIABLE_PATTERNS),
  ].filter((finding) => finding.status !== "pass");
}

export function lintCampaign(campaign: Campaign, context: Partial<LintContext> = {}): LintResult {
  const ctx: LintContext = { ...DEFAULT_LINT_CONTEXT, ...context };
  const text = copyText(campaign);

  const findings: LintRuleFinding[] = [
    ...checkDestination(campaign, ctx),
    ...checkAffiliateTransparency(campaign, ctx),
    ...runClaimPatterns(text, HEALTH_PATTERNS),
    ...runClaimPatterns(text, UNVERIFIABLE_PATTERNS),
    ...checkAdConsistency(campaign),
    ...checkContentQuality(campaign),
    ...checkCtaAndLinks(campaign, ctx),
    ...checkTrustStructure(ctx),
    ...checkLanguage(campaign),
  ];

  const score = legacyRiskScore(findings);
  return {
    version: LINTER_VERSION,
    findings,
    gate: publicationGate(findings),
    legacyRiskScore: score,
    score,
  };
}

export function findingsByCategory(result: LintResult): Array<{
  category: LintCategory;
  label: string;
  worst: LintStatus;
  findings: LintRuleFinding[];
}> {
  const order: LintCategory[] = [
    "DESTINATION_INTEGRITY",
    "AFFILIATE_TRANSPARENCY",
    "HEALTH_AND_SENSITIVE_CLAIMS",
    "UNVERIFIABLE_CLAIMS",
    "AD_LANDING_CONSISTENCY",
    "CONTENT_QUALITY",
    "CTA_AND_LINKS",
    "TRUST_AND_SITE_STRUCTURE",
    "LANGUAGE_QUALITY",
  ];
  return order.map((category) => {
    const group = result.findings.filter((f) => f.category === category);
    const worst: LintStatus = group.some((f) => f.status === "fail")
      ? "fail"
      : group.some((f) => f.status === "warn")
        ? "warn"
        : "pass";
    return { category, label: CATEGORY_LABELS[category], worst, findings: group };
  });
}

/** @deprecated Old finding shape is gone; use LintRuleFinding.ruleId. Kept name for grep during migration. */
export type LintSeverity = LintStatus;
export type LintFinding = LintRuleFinding;
