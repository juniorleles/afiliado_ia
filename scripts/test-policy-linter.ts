// npx tsx scripts/test-policy-linter.ts
import { lintCampaign } from "../src/lib/policy-linter.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function makeCampaign(overrides: Partial<Campaign>): Campaign {
  return {
    id: 1,
    name: "Test",
    slug: "winter-jacket-review",
    headline: "Winter Jacket XT-200 Review: Does It Actually Keep You Warm?",
    body: FACTUAL_BODY,
    ctaLabel: "Check current price",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

const FACTUAL_BODY = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting when temperatures drop. It is a clothing product, not a treatment.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Standard front zipper and pockets

## Who May Consider It?

People who want a practical winter coat for short outdoor trips, school runs, or a cold commute.

## Things to Consider

Fit can run large. Check the merchant size chart before you buy. Weather protection depends on what you wear underneath.

## FAQ

- Does it replace a technical mountaineering suit? No. It is a daily winter jacket.
- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days and you already like this silhouette.
`;

function rule(campaign: Partial<Campaign>, ruleId: string, ctx?: Parameters<typeof lintCampaign>[1]) {
  const result = lintCampaign(makeCampaign(campaign), ctx);
  return result.findings.find((f) => f.ruleId === ruleId);
}

const safe = lintCampaign(makeCampaign({}));
assert(safe.gate === "READY", `factual review is READY (veio ${safe.gate})`);
assert(
  !safe.findings.some((f) => f.category === "HEALTH_AND_SENSITIVE_CLAIMS" && f.status !== "pass"),
  "factual review has no blocking health claim",
);

const cures = rule({ headline: "This jacket cures arthritis overnight" }, "health.cure");
assert(cures?.status === "fail" && cures.blocking, '"cures arthritis" is a blocking health fail');
assert(cures?.evidence?.toLowerCase().includes("cure"), "cure evidence includes matched text");

const timeBound = rule({ body: FACTUAL_BODY + "\n\nThis eliminates pain in 7 days for everyone." }, "health.time_bound");
assert(timeBound?.status === "fail", '"eliminates pain in 7 days" is detected');
assert(timeBound?.evidence?.toLowerCase().includes("pain"), "time-bound evidence includes matched text");

const fda = rule({ headline: "FDA approved winter jacket" }, "health.authority");
assert(fda?.status === "fail" && fda.evidence?.toLowerCase().includes("fda"), '"FDA approved" is detected');

const doctor = rule({ body: FACTUAL_BODY + "\n\nDoctor approved for daily wear." }, "health.authority");
assert(doctor?.status === "fail" && doctor.evidence?.toLowerCase().includes("doctor"), '"doctor approved" is detected');

const guaranteed = rule({ headline: "Guaranteed results in any climate" }, "health.guarantee");
assert(guaranteed?.status === "fail", '"guaranteed results" is detected');

const rank = rule({ headline: "#1 supplement jacket ranking" }, "unv.rank");
assert(rank?.status === "fail" && rank.evidence?.includes("1"), '"#1 supplement" style ranking is detected');

const clinical = rule({ body: FACTUAL_BODY + "\n\nClinically proven warmth technology." }, "unv.clinical");
assert(clinical?.status === "fail", '"clinically proven" is detected as unverifiable');

const leaked = lintCampaign(makeCampaign({ body: FACTUAL_BODY + "\n\nVocê vai adorar este produto na sua rotina." }));
const leak = leaked.findings.find((f) => f.ruleId === "lang.portuguese");
assert(leak?.status === "fail", "Portuguese leakage is detected");
assert(leaked.gate === "BLOCKED", "Portuguese leakage is BLOCKED");

const commute = rule({
  body: FACTUAL_BODY.replace("cold commute", "cold commute through downtown"),
}, "lang.portuguese");
assert(commute?.status === "pass", '"commute" does not false-positive Portuguese "com"');

const company = rule({
  body: `${FACTUAL_BODY}\n\nOur company offers comfortable, complete coverage comparable to the parameter above.`,
}, "lang.portuguese");
assert(company?.status === "pass", "company/comfortable/complete do not false-positive Portuguese");

const placeholder = rule({ body: FACTUAL_BODY + "\n\n[PRODUCT NAME] INSERT HERE Lorem ipsum" }, "lang.placeholder");
assert(placeholder?.status === "fail" && placeholder.blocking, "placeholder text is blocking");

const thin = lintCampaign(
  makeCampaign({
    headline: "Buy now",
    body: "Go.",
  }),
);
const thinRule = thin.findings.find((f) => f.ruleId === "content.word_count");
assert(thinRule?.status === "fail" || thinRule?.status === "warn", "very thin page triggers thin-content risk");
assert(
  thin.findings.some((f) => f.ruleId === "content.word_count" && f.status !== "pass"),
  "thin-content rule is not a silent pass",
);

const reasonable = lintCampaign(makeCampaign({}));
assert(
  reasonable.findings.find((f) => f.ruleId === "content.word_count")?.status === "pass",
  "reasonable informational page does not trigger thin-content blocker",
);

const missingDisclosure = lintCampaign(makeCampaign({}), { disclosureAlwaysRendered: false });
const disc = missingDisclosure.findings.find((f) => f.ruleId === "aff.disclosure_visible");
assert(disc?.status === "fail" && disc.blocking, "missing disclosure is blocking");
assert(missingDisclosure.gate === "BLOCKED", "missing disclosure => BLOCKED");

const badUrl = lintCampaign(makeCampaign({ affiliateUrl: "not-a-url" }));
assert(
  badUrl.findings.find((f) => f.ruleId === "cta.http_url")?.status === "fail",
  "invalid affiliate URL is blocking",
);
assert(badUrl.gate === "BLOCKED", "invalid affiliate URL => BLOCKED");

const jsUrl = lintCampaign(makeCampaign({ affiliateUrl: "javascript:alert(1)" }));
assert(
  jsUrl.findings.find((f) => f.ruleId === "cta.not_javascript")?.status === "fail",
  "javascript: URL is blocking",
);
assert(jsUrl.gate === "BLOCKED", "javascript: URL => BLOCKED");

const unrelated = lintCampaign(
  makeCampaign({
    adHeadline: "Best Kitchen Blender 2026 Deals",
  }),
);
assert(
  unrelated.findings.find((f) => f.ruleId === "ad.topic_overlap")?.status === "fail",
  "obviously unrelated ad/page is detected",
);

const relatedAd = lintCampaign(
  makeCampaign({
    adHeadline: "Winter Jacket XT-200 — Honest Warmth Review",
  }),
);
assert(
  relatedAd.findings.find((f) => f.ruleId === "ad.topic_overlap")?.status === "pass",
  "reasonable ad/page overlap passes",
);

assert(lintCampaign(makeCampaign({})).gate === "READY", "clean factual result => READY");

const warnOnly = lintCampaign(
  makeCampaign({
    body: "## Benefits\n\n- Warm enough for a cold morning walk downtown.\n\n## FAQ\n\n- Is it a winter jacket? Yes, that is the product type.",
  }),
);
assert(warnOnly.gate === "REVIEW_REQUIRED", `warnings only => REVIEW_REQUIRED (veio ${warnOnly.gate})`);
assert(
  !warnOnly.findings.some((f) => f.status === "fail" && f.blocking),
  "short-but-not-empty page has no blocking fail",
);

const blocked = lintCampaign(makeCampaign({ headline: "Miracle jacket cures arthritis" }));
assert(blocked.gate === "BLOCKED", "blocking fail => BLOCKED");

assert(typeof safe.legacyRiskScore === "number", "LEGACY_RISK_SCORE is still computed");
assert(safe.score === safe.legacyRiskScore, "score aliases legacyRiskScore");

const sourcedClaims = lintCampaign(
  makeCampaign({
    body: `${FACTUAL_BODY}

This formula is clinically proven and scientifically proven. It is a natural anti-inflammatory that supports the immune system.

## Affiliate Disclosure

We may earn a commission if you buy through our link.`,
  }),
);
assert(
  sourcedClaims.findings.some(
    (f) =>
      (f.ruleId === "health.authority" || f.ruleId === "unv.clinical") &&
      f.status === "fail" &&
      /clinically proven/i.test(f.evidence ?? ""),
  ),
  "DIRECT_SOURCE-style health claims are still linted in consumer copy",
);
assert(sourcedClaims.gate === "BLOCKED", "provenance does not whitelist clinically-proven copy");

function healthRule(bodyOrHeadline: { body?: string; headline?: string }, ruleId: string) {
  return rule(
    {
      headline: bodyOrHeadline.headline ?? "Winter Jacket XT-200 Review: Does It Actually Keep You Warm?",
      body: `${FACTUAL_BODY}\n\n${bodyOrHeadline.body ?? ""}`,
    },
    ruleId,
  );
}

const independentInflammation = healthRule({ body: "This formula is a natural anti-inflammatory." }, "health.inflammation");
assert(independentInflammation?.status === "warn", "independent 'natural anti-inflammatory' is a warning");

const independentImmune = healthRule({ body: "This formula supports immune function." }, "health.immune");
assert(independentImmune?.status === "warn", "independent 'supports immune function' is a warning");
assert(independentImmune?.status !== "pass", "softening is not required; bare 'supports immune' is still flagged");

const softenedImmune = healthRule({ body: "This tablet may support immune function." }, "health.immune");
assert(softenedImmune?.status === "warn", "softened 'may support immune function' is still a warning");

const respiratory = healthRule({ body: "It supports respiratory health during cold months." }, "health.respiratory");
assert(respiratory?.status === "warn", "respiratory health support is flagged");

const sinus = healthRule({ body: "Buyers mention sinus support in passing." }, "health.respiratory");
assert(sinus?.status === "warn", "sinus support is flagged");

const inflammationManage = healthRule({ body: "Ingredients help manage inflammation after meals." }, "health.inflammation");
assert(inflammationManage?.status === "warn", "manage inflammation is flagged");

const researchSuggests = healthRule({ body: "Research suggests the coating stays intact in cold rain." }, "health.research_language");
assert(researchSuggests?.status === "warn", "research suggests is flagged");

const clinicalAuthority = healthRule({ body: "Clinically proven warmth technology." }, "health.authority");
assert(clinicalAuthority?.status === "fail" && clinicalAuthority.blocking, "clinically proven remains blocking");

const scientific = healthRule({ body: "Scientifically proven fiber fill." }, "unv.clinical");
assert(scientific?.status === "fail", "scientifically proven remains unverifiable fail");

const drug = healthRule({ body: "This supplement can interact with certain medications." }, "health.drug_interaction");
assert(drug?.status === "fail" && drug.blocking, "independent drug-interaction claim is blocking");

const safety = healthRule({ body: "Probiotic supplements are generally considered safe for healthy individuals." }, "health.safety_general");
assert(safety?.status === "warn", "general supplement safety claim is a warning");

const mechanism = healthRule({ body: "These probiotic strains are intended to colonize the mouth." }, "health.mechanism");
assert(mechanism?.status === "warn", "microbiome/colonization mechanism is flagged");

const doctorEndorsement = healthRule({ body: "Doctor approved for daily wear." }, "health.authority");
assert(doctorEndorsement?.status === "fail" && doctorEndorsement.blocking, "doctor endorsement remains blocking");

const fdaIndependent = healthRule({ headline: "FDA approved winter jacket" }, "health.authority");
assert(fdaIndependent?.status === "fail", "FDA approved remains blocking");

const guaranteedHealth = healthRule({ headline: "Guaranteed results in any climate" }, "health.guarantee");
assert(guaranteedHealth?.status === "fail", "guaranteed health/result language remains blocking");

const attributedImmune = healthRule(
  { body: "The product website states that ProDentim is designed to support immune function." },
  "health.immune",
);
assert(attributedImmune?.status === "warn", "attributed immune claim is still a warning");
assert(
  /attribution/i.test(`${attributedImmune?.message ?? ""} ${attributedImmune?.suggestion ?? ""}`),
  "attributed finding documents that attribution is not verification",
);

const attributedFda = healthRule(
  { body: "According to the product website, this jacket is FDA approved." },
  "health.authority",
);
assert(attributedFda?.status === "fail" && attributedFda.blocking, "attributed FDA claim remains blocking");
assert(
  /attribution/i.test(attributedFda?.suggestion ?? ""),
  "blocking attributed claims still note that attribution does not clear them",
);

const attributedSoft = healthRule(
  { body: "The product website states that the tablet may support immune function." },
  "health.immune",
);
assert(attributedSoft?.status === "warn", "attributed softened health claim is not auto-READY");

const ordinary = lintCampaign(makeCampaign({}));
assert(ordinary.gate === "READY", "ordinary jacket facts do not become a health false positive");
assert(
  ordinary.findings.filter((f) => f.category === "HEALTH_AND_SENSITIVE_CLAIMS" && f.status !== "pass").length === 0,
  "clean factual clothing copy has no health warnings",
);

const supportsCommute = healthRule(
  { body: "The insulated core supports a cold commute and school run." },
  "health.support_effect",
);
assert(supportsCommute?.status === "pass", "non-health 'supports' does not false-positive");

const consultAdvice = healthRule({ body: "Consult your doctor before use." }, "health.consult_professional");
assert(consultAdvice?.status === "warn", "unsupported consult-doctor advice is a policy warning");

const pregnancyAdvice = healthRule({ body: "Do not use if pregnant or nursing." }, "health.pregnancy_nursing");
assert(pregnancyAdvice?.status === "warn", "pregnancy/nursing caution is a policy warning");

const refundDuration = healthRule({ body: "This product has a 180-day refund policy." }, "health.refund_duration");
assert(refundDuration?.status === "warn", "unsupported guarantee duration is a policy warning");

const precisionCure = rule({ headline: "This product cures arthritis." }, "health.cure");
assert(precisionCure?.status === "fail" && precisionCure.blocking, "PRECISION I: direct cure claim is POLICY FAIL");

const designedCure = rule({ headline: "Designed to cure joint disease." }, "health.cure");
assert(designedCure?.status === "fail" && designedCure.blocking, "PRECISION I2: designed-to-cure remains POLICY FAIL");

const fdaDisclaimer = rule(
  { body: FACTUAL_BODY + "\n\nNot intended to diagnose, treat, cure, or prevent any disease." },
  "health.cure",
);
assert(fdaDisclaimer?.status === "pass", "PRECISION J: FDA-style negated disclaimer is not health.cure FAIL");

const LIVE_NEGATED_CURE_DISCLAIMER =
  "It is designed to support the body's natural joint-lubrication mechanisms and comfortable movement through daily use, but it does not claim to cure, treat, or prevent any disease.";

const liveNegatedCure = rule({ body: FACTUAL_BODY + "\n\n" + LIVE_NEGATED_CURE_DISCLAIMER }, "health.cure");
assert(
  liveNegatedCure?.status === "pass",
  "PRECISION J2: live-run negated 'does not claim to cure, treat, or prevent' disclaimer is not health.cure FAIL",
);

const disguisedCure = rule(
  { body: "This isn't just relief — it cures the underlying condition." },
  "health.cure",
);
assert(disguisedCure?.status === "fail" && disguisedCure.blocking, "PRECISION K2: disguised cure claim remains POLICY FAIL");

const negatedThenCure = rule(
  { body: "This product does not just relieve symptoms — it cures arthritis." },
  "health.cure",
);
assert(negatedThenCure?.status === "fail" && negatedThenCure.blocking, "PRECISION K: negation with a real cure claim is POLICY FAIL");

const sourcedConsultStillWarns = healthRule(
  { body: "Consult your healthcare provider if taking medication." },
  "health.consult_professional",
);
assert(
  sourcedConsultStillWarns?.status === "warn",
  "sourced consult copy still policy-WARNs; warning is not a grounding failure",
);

const officialCta = rule({ ctaLabel: "Visit Official Website" }, "cta.official_authority");
assert(officialCta?.status === "fail" && officialCta.blocking, "Official Website CTA is rejected without identity evidence");
assert(lintCampaign(makeCampaign({ ctaLabel: "Visit Official Website" })).gate === "BLOCKED", "Official Website CTA is not READY");

const safeCta = rule({ ctaLabel: "Learn More" }, "cta.official_authority");
assert(safeCta?.status === "pass", "Learn More is an allowed CTA");

console.log("\nTodos os testes do Policy Linter V2 passaram.");

