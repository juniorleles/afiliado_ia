// npx tsx scripts/test-affiliate-hop.ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  authorizeHop,
  ctaMayRender,
  markValidated,
  prepareOfficialOfferCta,
  productionPublicationBlocked,
  recordOfficialOfferClick,
  registerHop,
  validateHopFormat,
  writeHopRecord,
} from "../src/lib/affiliate-hop/index.ts";
import { probeHopDestination } from "../src/lib/affiliate-hop/probe.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const VALID = "https://labvendor.hop.clickbank.net";
const format = validateHopFormat(VALID);
assert(format.ok && format.host === "labvendor.hop.clickbank.net", "valid ClickBank hop is accepted");

assert(!validateHopFormat("http://labvendor.hop.clickbank.net").ok, "non-HTTPS is rejected");
assert(!validateHopFormat("https://example.com/buy").ok, "non-ClickBank domain is rejected");
assert(!validateHopFormat("https://shop.example.com/buy?hop=zzzzz").ok, "placeholder hop is rejected");
assert(!validateHopFormat("https://127.0.0.1/hop").ok, "SSRF loopback is rejected");
assert(!validateHopFormat("javascript:alert(1)").ok, "suspicious protocol is rejected");

const pending = registerHop({ productKey: "novalis-core", href: VALID, now: "2026-10-23T00:00:00.000Z" });
assert(pending.authorization === "PENDING_VALIDATION", "register starts as pending validation");
assert(pending.href === VALID, "registered href is not rewritten");

const validated = markValidated(pending);
assert(validated.authorization === "VALIDATED", "technical validation can reach VALIDATED");
assert(!ctaMayRender(validated), "VALIDATED does not render a CTA");
assert(productionPublicationBlocked(validated), "production stays blocked without explicit production authorization");

const noExplicit = authorizeHop(validated, "AUTHORIZED_FOR_PREVIEW", false);
assert(noExplicit.authorization === "VALIDATED", "preview authorization requires an explicit flag");
const preview = authorizeHop(validated, "AUTHORIZED_FOR_PREVIEW", true);
assert(preview.authorization === "AUTHORIZED_FOR_PREVIEW" && ctaMayRender(preview), "explicit preview authorization enables the CTA");
const cta = prepareOfficialOfferCta(preview);
assert(cta.visible && cta.label === "View Official Offer" && cta.href === VALID, "preview CTA uses View Official Offer");

const prodBlocked = authorizeHop(validated, "AUTHORIZED_FOR_PRODUCTION", false);
assert(prodBlocked.authorization === "VALIDATED", "production is not granted implicitly");

const blocked = registerHop({ productKey: "novalis-core", href: "https://evil.example/hop" });
assert(blocked.authorization === "BLOCKED", "false domain is blocked");
assert(!prepareOfficialOfferCta(blocked).visible, "blocked hop has no CTA");

async function main() {
const unexpected = await probeHopDestination({
  href: VALID,
  productName: "Novalis Core",
  hop: async (url) => {
    if (url.includes("hop.clickbank.net")) return { status: 302, location: "https://unrelated.example/other" };
    return { status: 200, location: null, body: "<html><p>Unrelated storefront</p></html>" };
  },
});
assert(unexpected.status === "INCONCLUSIVE" || unexpected.finalHost === "unrelated.example", "unexpected destination stays inconclusive");
assert(!unexpected.productMention, "unrelated page is not treated as a product match");

const ssrf = await probeHopDestination({
  href: VALID,
  productName: "Novalis Core",
  hop: async () => ({ status: 302, location: "https://127.0.0.1/admin" }),
});
assert(ssrf.status === "FAIL", "redirect to a private host fails");

const network = await probeHopDestination({
  href: VALID,
  productName: "Novalis Core",
  hop: async () => {
    throw new Error("The request timed out.");
  },
});
assert(network.status === "INCONCLUSIVE", "network failure is inconclusive and does not invent a destination");

const matched = await probeHopDestination({
  href: VALID,
  productName: "Novalis Core",
  hop: async (url) => {
    if (url.includes("hop.clickbank.net")) return { status: 302, location: "https://shop.novalis.example/core" };
    return { status: 200, location: null, body: "<html><h1>Novalis Core</h1></html>" };
  },
});
assert(matched.status === "PASS" && matched.productMention, "a public destination that names the product is recorded");
assert(matched.trackingPreserved === "PRESENT", "ClickBank hop host in the chain is tracking-present, not a sale");

const root = mkdtempSync(path.join(tmpdir(), "aia-hop-"));
writeHopRecord(preview, root);
const first = recordOfficialOfferClick({
  record: preview,
  productId: "novalis-core",
  landingPageId: "lp-lab",
  presellMode: "PRESELL_BOFU",
  eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  storeRoot: root,
  now: "2026-10-23T00:00:00.000Z",
});
assert(first.ok, "a real authorized click can be recorded");
const dup = recordOfficialOfferClick({
  record: preview,
  productId: "novalis-core",
  landingPageId: "lp-lab",
  eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  storeRoot: root,
});
assert(!dup.ok && dup.reason === "DUPLICATE_EVENT", "duplicate event ids are rejected");
const simulated = recordOfficialOfferClick({
  record: preview,
  productId: "novalis-core",
  simulated: true,
  storeRoot: root,
});
assert(!simulated.ok && simulated.reason === "SIMULATED_REJECTED", "simulated clicks are rejected");
const unauthorizedClick = recordOfficialOfferClick({
  record: validated,
  productId: "novalis-core",
  storeRoot: root,
});
assert(!unauthorizedClick.ok && unauthorizedClick.reason === "CTA_NOT_AUTHORIZED", "clicks without CTA authorization are rejected");

const libFiles = [
  "src/lib/affiliate-hop/format.ts",
  "src/lib/affiliate-hop/authorize.ts",
  "src/lib/affiliate-hop/probe.ts",
  "src/lib/affiliate-hop/cta.ts",
  "src/lib/affiliate-hop/track.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/femicore|getfemicore|f64beou95qrrbo1mzhv1ojweet/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-affiliate-hop.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
