// npx tsx scripts/test-gate-trace-persistence.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { composePublicationGate, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { resetDbForTests } from "../src/lib/db.ts";
import { emptyProductFacts, type ReturnsInformationFact } from "../src/lib/product-facts.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";
import { groundingRepresentationHash } from "../src/lib/validation/gate-trace.ts";
import { composeCandidateFromVariant } from "../src/lib/validation/pipeline.ts";
import { createValidationRun, getValidationCandidate, insertValidationCandidate } from "../src/lib/validation/store.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const prevDb = process.env.PRESELL_OS_DB;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-trace-"));
process.env.PRESELL_OS_DB = path.join(tmp, "presell-os.db");
resetDbForTests();

function returnFact(statement: string): ReturnsInformationFact {
  return {
    kind: "RETURN_WINDOW",
    statement,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://example.com/northwind/returns",
    sourcePageCategory: "RETURNS",
  };
}

const blockedFacts = emptyProductFacts("Northwind Daily Capsule", "https://example.com/northwind", "IMPORTED");
blockedFacts.description = "A morning capsule described on the product page.";
blockedFacts.confidence.description = "DIRECT_SOURCE";
blockedFacts.returnsInformation = [
  returnFact("You have 60 days after receiving your order."),
  {
    ...returnFact("Contact the seller if the package arrives damaged."),
    kind: "OTHER",
  },
];

const blockedRun = createValidationRun("gate-trace-blocked");
const blocked = insertValidationCandidate(
  composeCandidateFromVariant({
    runId: blockedRun.id,
    productKey: "northwind",
    facts: blockedFacts,
    approach: "REVIEW",
    headline: "Northwind Daily Capsule",
    ctaLabel: "Learn More",
    body: `## What Is This Product?

A morning capsule described on the product page.

## Returns

You have 60 days after receiving your order if you are not completely satisfied.`,
  }),
);
const stored = getValidationCandidate(blocked.id);
const trace = stored?.contentQa.gateTrace;
assert(Boolean(trace), "blocked candidate stores a gate trace");
assert(trace?.preComposition.stage === "PRE_COMPOSITION_GROUNDING", "pre-composition stage is labeled");
assert(trace?.finalComposition.stage === "FINAL_COMPOSITION_GROUNDING", "final composition stage is labeled");
assert(trace?.preComposition.status === "UNGROUNDED", "pre-composition grounding stays UNGROUNDED");
assert(stored?.contentQa.groundingStatus === "UNGROUNDED", "publication grounding status stays the pre-composition decision");
assert(stored?.contentQa.finalGate === "BLOCKED", "BLOCKED publication gate is unchanged");
assert(trace?.finalComposition.status === "GROUNDED", "composed page grounding is recorded separately");
assert(
  trace?.preComposition.evaluatedHash === groundingRepresentationHash(trace?.preComposition.representation || ""),
  "pre-composition hash matches the stored representation",
);
const failure = trace?.preComposition.failures.find((item) => item.reason.includes("unsupported semantic merge"));
assert(Boolean(failure), "the blocking proposition is persisted");
assert(failure?.section === "Returns", "failure stays associated with the returns heading");
assert((failure?.authorizedEvidence.length ?? 0) > 0, "failure records the authorized return evidence");
assert(
  !trace?.finalComposition.representation.toLowerCase().includes("completely satisfied"),
  "composed representation does not keep the blocking sentence",
);
const page = parsePresellPage(stored?.pageCompositionJson);
assert(
  !page?.sections.some((section) => section.paragraphs.join(" ").toLowerCase().includes("completely satisfied")),
  "composed page does not replace the blocking snapshot",
);
const replay = validateGrounding(trace!.preComposition.representation, blockedFacts);
assert(replay.status === "UNGROUNDED", "replaying the stored representation reproduces UNGROUNDED");
assert(
  replay.unsupportedClaims.some((item) => item.claim === failure?.proposition && item.reason === failure?.reason),
  "replaying reproduces the same proposition and reason",
);
const finalReplay = validateGrounding(trace!.finalComposition.representation, blockedFacts);
assert(finalReplay.status === "GROUNDED", "replaying the composed representation stays GROUNDED");

const readyFacts = emptyProductFacts("Harbor Trail Shell", "https://example.com/harbor", "IMPORTED");
readyFacts.description = "A hooded shell jacket described on the product page.";
readyFacts.confidence.description = "DIRECT_SOURCE";
readyFacts.features = ["The shell has a full-length front zipper."];
readyFacts.confidence.features = "DIRECT_SOURCE";
const readyRun = createValidationRun("gate-trace-ready");
const ready = insertValidationCandidate(
  composeCandidateFromVariant({
    runId: readyRun.id,
    productKey: "harbor",
    facts: readyFacts,
    approach: "REVIEW",
    headline: "Harbor Trail Shell",
    ctaLabel: "Learn More",
    body: `## What Is This Product?

A hooded shell jacket described on the product page.

## Key Features

The shell has a full-length front zipper.`,
  }),
);
const readyTrace = ready.contentQa.gateTrace;
assert(readyTrace?.preComposition.status === "GROUNDED", "READY-path pre-composition grounding stays GROUNDED");
assert(readyTrace?.finalComposition.status === "GROUNDED", "READY-path composed grounding stays GROUNDED");
assert(readyTrace?.preComposition.failures.length === 0, "READY-path stores no grounding failures");
assert(ready.contentQa.groundingStatus === "GROUNDED", "READY-path publication grounding is unchanged");
assert(
  ready.contentQa.finalGate === composePublicationGate(ready.contentQa.policyGate, ready.contentQa.groundingStatus),
  "trace persistence does not change the publication gate",
);
assert(ready.contentQa.finalGate !== "BLOCKED", `grounded candidate is not newly blocked (${ready.contentQa.finalGate})`);

if (prevDb === undefined) delete process.env.PRESELL_OS_DB;
else process.env.PRESELL_OS_DB = prevDb;
resetDbForTests();
