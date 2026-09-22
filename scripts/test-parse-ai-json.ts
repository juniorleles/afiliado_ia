// npx tsx scripts/test-parse-ai-json.ts
import {
  classifyJsonPayload,
  extractJsonText,
  JsonExtractError,
} from "../src/lib/ai/parse-ai-json.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const raw = "[1,2,3]";
assert(extractJsonText(raw).source === "raw", "raw JSON is accepted");
assert(classifyJsonPayload(raw) === "raw_json", "raw JSON is classified");

const fenced = "```json\n{\"ok\":true}\n```";
assert(extractJsonText(fenced).jsonText === '{"ok":true}', "fenced JSON is unwrapped");
assert(classifyJsonPayload(fenced) === "markdown_fence", "fenced JSON is classified");

const prose = 'Prefix text\n```json\n{"ok":true}\n```\nThanks';
assert(JSON.parse(extractJsonText(prose).jsonText).ok === true, "prose + fence extracts JSON");

const unlabeledFence = "```\n[1,2]\n```";
assert(extractJsonText(unlabeledFence).source === "markdown_fence", "unlabeled markdown fence is unwrapped");

const nested = 'Intro\n{"items":[{"n":1},{"n":2}]}\nend';
assert(JSON.parse(extractJsonText(nested).jsonText).items.length === 2, "nested object/array JSON is extracted");

const embedded = 'Here is data: {"ok":true} trailing';
assert(JSON.parse(extractJsonText(embedded).jsonText).ok === true, "embedded JSON object is extracted");

try {
  extractJsonText('{"ok":');
  throw new Error("FALHOU: truncated JSON deveria ter lançado");
} catch (err) {
  assert(err instanceof JsonExtractError, "truncated JSON is JsonExtractError");
  assert((err as JsonExtractError).kind === "truncated", "truncated kind is truncated");
}

try {
  extractJsonText("```json\n{\"ok\":true");
  throw new Error("FALHOU: truncated fenced JSON deveria ter lançado");
} catch (err) {
  assert(err instanceof JsonExtractError, "truncated fenced JSON is JsonExtractError");
  assert((err as JsonExtractError).kind === "truncated", "truncated fenced kind is truncated");
}

try {
  extractJsonText("");
  throw new Error("FALHOU: empty JSON deveria ter lançado");
} catch (err) {
  assert(err instanceof JsonExtractError, "empty JSON is JsonExtractError");
  assert((err as JsonExtractError).kind === "empty", "empty kind is empty");
}

try {
  extractJsonText("not json at all");
  throw new Error("FALHOU: malformed JSON deveria ter lançado");
} catch (err) {
  assert(err instanceof JsonExtractError, "malformed JSON is JsonExtractError");
  assert((err as JsonExtractError).kind === "malformed", "malformed kind is malformed");
}

console.log("\nTodos os testes do parser JSON de IA passaram.");
