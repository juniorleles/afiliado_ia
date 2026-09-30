// npx tsx scripts/test-faq-identity-tokens-v1.ts
//
// FAQ question semantics derives product-identity tokens from the product name
// in context, never from product-name literals. Fictional products only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const ask = (question: string, supportText: string, productName: string) =>
  validateFaqQuestion({ question, topic: "features", authorizedTopics: ["features"], supportText, productName }).semanticResult;

// Identity is the subject, not evidence: a name echo cannot supply a missing predicate.
assert(ask("Does Glowmint support Glowmint sleep recovery?", "Glowmint supports sleep.", "Glowmint") === "FAIL", "1: product name does not count as a supported predicate token");
assert(ask("Does Glowmint support Glowmint sleep recovery?", "Glowmint supports sleep recovery.", "Glowmint") === "PASS", "2: supported predicate still passes");
// Identity absent from the support text does not block a sourced predicate.
assert(ask("Does Harrowfield Lamp support Harrowfield dimming?", "Supports dimming.", "Harrowfield Lamp") === "PASS", "3: missing identity token does not fail a sourced predicate");
// A word shared with another product's name is ordinary content for this product.
assert(ask("Does Tidewell support joint comfort?", "Supports comfort.", "Tidewell") === "FAIL", "4: non-identity words are always required evidence");
assert(ask("Does Tidewell support joint comfort?", "Supports joint comfort.", "Tidewell") === "PASS", "5: sourced multi-word predicate passes");
// Multi-word names, punctuation and trademark marks tokenize.
assert(ask("Does Brisk-Oar Pro™ support Brisk-Oar Pro rowing?", "Supports rowing.", "Brisk-Oar Pro™") === "PASS", "6: hyphenated / marked names are identity tokens");

const source = readFileSync(path.join(process.cwd(), "src/lib/ai/faq-question-semantics.ts"), "utf8");
assert(!/joint|genesis|prodentim/i.test(source), "7: no product-name literals in generic FAQ semantics");

console.log("ALL FAQ IDENTITY TOKEN V1 TESTS PASSED");
