/** Read-only probe: Replay 04 validation artifacts. */
import { readFileSync } from "node:fs";

const dir = "data/generic-lp-engine/v1/prodentim-replay-04/";
const read = (file: string) => JSON.parse(readFileSync(dir + file, "utf8"));

console.log("REPORT", JSON.stringify(read("replay-report.json"), null, 1));
console.log("GROUNDING", JSON.stringify(read("grounding.json"), null, 1));
console.log("POLICY", JSON.stringify(read("policy.json"), null, 1));
const gate = read("content-gate.json") as { faqItems: unknown; copy: { body: string; headline: string }; contentGate: string; gatePassed: boolean };
console.log("GATE", gate.contentGate, "passed=", gate.gatePassed);
console.log("FAQ", JSON.stringify(gate.faqItems, null, 1));
console.log("HEADLINE", JSON.stringify(gate.copy.headline));
console.log("BODY\n" + gate.copy.body);
const raw = read("generation-raw.json") as { fills: Array<Record<string, unknown>> };
console.log("FILLS", JSON.stringify(raw.fills, null, 1));
