import type {
  AffiliatePolicyContract,
  AffiliatePolicyField,
  AffiliatePolicyRule,
  PolicyVerdict,
} from "@/lib/affiliate-policy/types";

const TOPICS: Record<AffiliatePolicyField, RegExp> = {
  brandBiddingPolicy: /brand\s*bidd|trademark\s*bidd|bid(?:ding)?\s+on\s+(?:the\s+)?(?:brand|trademark)/i,
  paidSearchPolicy: /paid\s+search|google\s+ads|ppc|pay[\s-]?per[\s-]?click|search\s+ads/i,
  directLinkingPolicy: /\bdirect(?:ly)?\s+link(?:ing)?\b/i,
  presellPolicy: /pre[\s-]?sell/i,
  approvedAssetsPolicy: /approved\s+(?:image|banner|asset|creative)|image\s+usage|use\s+of\s+images/i,
  pricingClaimsPolicy: /price\s+claim|pricing\s+restrict|do\s+not\s+(?:advertise|claim)\s+(?:a\s+)?price/i,
  trademarkRestrictions: /trademark|brand\s+name\s+restrict/i,
  geographicRestrictions: /(?:not\s+allowed|prohibited|restricted)\s+in|geo(?:graphic)?\s+restrict|countries?\s+allowed/i,
  disclosureRequirements: /affiliate\s+disclosure|disclose\s+(?:your\s+)?(?:affiliate|relationship)/i,
};

const PROHIBITED = /\b(not\s+allowed|not\s+permitted|prohibited|forbidden|do\s+not|don't|cannot|must\s+not|no\s+longer\s+allowed)\b/i;
const ALLOWED = /(?<!not\s)\b(you\s+may|is\s+allowed|are\s+allowed|permitted|you\s+can)\b/i;
const CONDITIONAL = /\b(only\s+if|provided\s+that|as\s+long\s+as|unless|except)\b/i;

function visibleText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, ". ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text: string): string[] {
  return visibleText(text)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifySentence(sentence: string): PolicyVerdict {
  const prohibited = PROHIBITED.test(sentence);
  const allowed = ALLOWED.test(sentence);
  if (prohibited && allowed) return "CONFLICTING";
  if (prohibited) return "EXPLICITLY_PROHIBITED";
  if (CONDITIONAL.test(sentence)) return "CONDITIONAL";
  if (allowed) return "EXPLICITLY_ALLOWED";
  return "UNKNOWN";
}

function mergeVerdicts(values: PolicyVerdict[]): PolicyVerdict {
  const unique = [...new Set(values.filter((item) => item !== "UNKNOWN"))];
  if (!unique.length) return "UNKNOWN";
  if (unique.includes("CONFLICTING")) return "CONFLICTING";
  if (unique.includes("EXPLICITLY_ALLOWED") && unique.includes("EXPLICITLY_PROHIBITED")) return "CONFLICTING";
  if (unique.length === 1) return unique[0]!;
  if (unique.includes("CONDITIONAL")) return "CONDITIONAL";
  return "CONFLICTING";
}

function emptyRule(field: AffiliatePolicyField): AffiliatePolicyRule {
  return {
    field,
    verdict: "UNKNOWN",
    excerpt: null,
    evidenceIds: [],
    notes: ["UNKNOWN does not mean allowed. Absence of a rule is not permission."],
  };
}

export function extractAffiliatePolicy(input: {
  campaignId: number;
  texts: Array<{ text: string; evidenceId?: string; sourceUrl?: string }>;
}): AffiliatePolicyContract {
  const rules = Object.fromEntries(
    (Object.keys(TOPICS) as AffiliatePolicyField[]).map((field) => [field, emptyRule(field)]),
  ) as Record<AffiliatePolicyField, AffiliatePolicyRule>;

  const evidenceIds: string[] = [];
  for (const item of input.texts) {
    const chunks = sentences(item.text);
    for (const field of Object.keys(TOPICS) as AffiliatePolicyField[]) {
      const matches = chunks
        .filter((sentence) => TOPICS[field].test(sentence))
        .map((sentence) => ({ sentence, verdict: classifySentence(sentence) }));
      if (!matches.length) continue;
      const verdict = mergeVerdicts(matches.map((item) => item.verdict));
      const current = rules[field];
      const excerptSource = matches.find((item) => item.verdict === verdict) ?? matches[0];
      rules[field] = {
        field,
        verdict: current.verdict === "UNKNOWN" ? verdict : mergeVerdicts([current.verdict, verdict]),
        excerpt: current.excerpt ?? excerptSource?.sentence.slice(0, 280) ?? null,
        evidenceIds: [...new Set([...current.evidenceIds, ...(item.evidenceId ? [item.evidenceId] : [])])],
        notes: current.notes,
      };
      if (item.evidenceId) evidenceIds.push(item.evidenceId);
    }
  }

  return {
    campaignId: input.campaignId,
    reviewStatus: "REVIEW_REQUIRED",
    ...rules,
    authorizedDestinations: [],
    policySourceEvidence: [...new Set(evidenceIds)],
    publicationReady: false,
  };
}
