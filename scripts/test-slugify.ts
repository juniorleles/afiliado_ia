// Roda com: node --experimental-strip-types scripts/test-slugify.ts
import { slugify, validateSlug } from "../src/lib/slug.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

assert(slugify("Winter Jacket XT-200") === "winter-jacket-xt-200", "espaço vira hífen, maiúscula vira minúscula");
assert(slugify("Café com Açúcar") === "cafe-com-acucar", "remove acento");
assert(slugify("  leading and trailing  ") === "leading-and-trailing", "espaço nas pontas não vira hífen sobrando");
assert(slugify("a---b") === "a-b", "hífens duplicados colapsam em 1 só");
assert(slugify("100% Cotton!!!") === "100-cotton", "pontuação vira hífen, sem hífen sobrando no fim");

const samples = ["Winter Jacket XT-200", "Café com Açúcar", "100% Cotton!!!", "Simple Name"];
for (const s of samples) {
  const slug = slugify(s);
  const error = validateSlug(slug);
  assert(error === null, `slugify("${s}") = "${slug}" passa em validateSlug (erro: ${error})`);
}

console.log("\nTodos os testes de slugify passaram.");
