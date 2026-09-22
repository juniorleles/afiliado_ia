// Roda com: node --experimental-strip-types scripts/test-affiliate-url.ts
import { buildAffiliateHref } from "../src/lib/affiliate-url.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const incoming1 = new URLSearchParams(
  "utm_source=google&utm_medium=cpc&utm_campaign=winter24&gclid=abc123",
);
const href1 = buildAffiliateHref("https://aff.example.com/product", incoming1);
assert(href1.includes("utm_source=google"), "utm_source repassado");
assert(href1.includes("utm_campaign=winter24"), "utm_campaign repassado");
assert(href1.includes("gclid=abc123"), "gclid (click id do Google Ads) repassado");

const incoming2 = new URLSearchParams("utm_source=meta&debug=true&ref=internal");
const href2 = buildAffiliateHref("https://aff.example.com/product", incoming2);
assert(href2.includes("utm_source=meta"), "utm_source repassado (caso 2)");
assert(!href2.includes("debug=true"), "parâmetro não-UTM/click-id NÃO é repassado");
assert(!href2.includes("ref=internal"), "outro parâmetro não-UTM também não é repassado");

const incoming3 = new URLSearchParams("utm_source=google");
const href3 = buildAffiliateHref("https://aff.example.com/product?ref=partner123", incoming3);
assert(href3.includes("ref=partner123"), "query string já existente na affiliateUrl é preservada");
assert(href3.includes("utm_source=google"), "UTM novo é somado, não substitui");

const href4 = buildAffiliateHref("https://aff.example.com/product", new URLSearchParams());
assert(href4 === "https://aff.example.com/product", "sem UTM na entrada, URL sai igual à original");

const href6 = buildAffiliateHref(
  "https://hop.clickbank.net/?affiliate=nick&vendor=vend",
  new URLSearchParams("utm_source=google&gclid=abc123"),
);
assert(href6.includes("utm_source=google"), "ClickBank hop still receives utm_source");
assert(href6.includes("gclid=abc123"), "ClickBank hop still receives gclid");
assert(!href6.includes("extclid"), "buildAffiliateHref does not invent ClickBank extclid");
assert(!/[\?&]tid=/.test(href6), "buildAffiliateHref does not invent ClickBank tid");

const href5 = buildAffiliateHref("not a valid url at all", new URLSearchParams("utm_source=x"));
assert(href5 === "not a valid url at all", "URL malformada não lança erro, devolve valor bruto");

console.log("\nTodos os testes do construtor de URL de afiliado passaram.");
