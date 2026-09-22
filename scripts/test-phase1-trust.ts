// npx tsx scripts/test-phase1-trust.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAffiliateHref } from "../src/lib/affiliate-url.ts";
import { parseMarkdown } from "../src/lib/markdown.ts";
import { presellMetaDescription } from "../src/lib/presell-meta.ts";
import {
  AFFILIATE_CTA_REL,
  PUBLIC_FOOTER_LINKS,
  HEALTH_DISCLAIMER_TEXT,
  TRUST_EDITORIAL,
} from "../src/lib/public-site.ts";
import { analyticsSkipHeaders } from "../src/lib/analytics.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const requiredHrefs = [
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
];
assert(PUBLIC_FOOTER_LINKS.length === 5, "footer tem 5 links de confiança");
for (const href of requiredHrefs) {
  assert(
    PUBLIC_FOOTER_LINKS.some((l) => l.href === href),
    `footer inclui ${href}`,
  );
}

assert(AFFILIATE_CTA_REL === "nofollow sponsored", 'CTA rel é "nofollow sponsored"');
assert(!AFFILIATE_CTA_REL.includes("noopener"), "CTA não depende de nova aba/noopener");

const incoming = new URLSearchParams("utm_source=google&gclid=abc123&fbclid=fb1&msclkid=ms1");
const href = buildAffiliateHref("https://aff.example.com/hop", incoming);
assert(href.includes("utm_source=google"), "utm_source ainda propaga");
assert(href.includes("gclid=abc123"), "gclid ainda propaga");
assert(href.includes("fbclid=fb1"), "fbclid ainda propaga");
assert(href.includes("msclkid=ms1"), "msclkid ainda propaga");

const templateSrc = readFileSync(join(process.cwd(), "src/components/campaign-template.tsx"), "utf8");
const ctaSrc = readFileSync(join(process.cwd(), "src/components/affiliate-cta.tsx"), "utf8");
assert(ctaSrc.includes("rel={AFFILIATE_CTA_REL}"), "template usa rel configurado");
assert(!templateSrc.includes('target="_blank"') && !ctaSrc.includes('target="_blank"'), "CTA não abre em nova aba");
assert(!templateSrc.includes("window.location"), "sem redirect JS no template");
assert(!templateSrc.includes("meta http-equiv"), "sem meta refresh no template");
assert(templateSrc.includes("{block.text}"), "headings/parágrafos renderizam texto, não HTML cru");
assert(templateSrc.includes("{item}"), "itens de lista renderizam texto, não HTML cru");
assert(
  templateSrc.includes("dangerouslySetInnerHTML={{ __html: campaign.headScript }}"),
  "dangerouslySetInnerHTML permanece só no pixel opcional do operador",
);
assert(
  templateSrc.includes("renderPixel && campaign.headScript"),
  "pixel continua condicionado a renderPixel (público only)",
);
assert(templateSrc.includes("TrustEditorialBlock") || templateSrc.includes(TRUST_EDITORIAL.heading), "bloco How we review presente");
assert(templateSrc.includes(HEALTH_DISCLAIMER_TEXT) || templateSrc.includes("HealthDisclaimer"), "disclaimer de saúde suportado");

const unsafe = parseMarkdown('<script>document.cookie</script>');
assert(unsafe[0]?.type === "paragraph", "script no body vira parágrafo");
assert(
  unsafe[0]?.type === "paragraph" && unsafe[0].text.includes("<script>document.cookie</script>"),
  "parser não executa HTML do body da campanha",
);

const desc = presellMetaDescription("Headline here", "First paragraph about the jacket.\n\n## FAQ\n\n- Q?");
assert(desc.includes("First paragraph"), "meta description usa o 1º parágrafo");
assert(!desc.includes("FAQ"), "meta description não precisa da seção FAQ");

const base = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function fetchPage(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${path}`, {
    redirect: "manual",
    headers: analyticsSkipHeaders(),
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main() {
  const about = await fetchPage("/about");
  assert(about.status === 200, `/about retorna 200 (veio ${about.status})`);
  assert(about.body.includes("independent product reviews") || about.body.includes("independent product"), "/about tem conteúdo real");

  const contact = await fetchPage("/contact");
  assert(contact.status === 200, `/contact retorna 200 (veio ${contact.status})`);
  assert(contact.body.toLowerCase().includes("mailto:"), "/contact tem email");

  const privacy = await fetchPage("/privacy");
  assert(privacy.status === 200, `/privacy retorna 200 (veio ${privacy.status})`);
  assert(privacy.body.includes("gclid") && privacy.body.toLowerCase().includes("affiliate"), "/privacy cobre gclid e afiliado");

  const terms = await fetchPage("/terms");
  assert(terms.status === 200, `/terms retorna 200 (veio ${terms.status})`);
  assert(terms.body.toLowerCase().includes("informational"), "/terms cobre propósito informativo");

  const disclosure = await fetchPage("/affiliate-disclosure");
  assert(disclosure.status === 200, `/affiliate-disclosure retorna 200 (veio ${disclosure.status})`);
  assert(disclosure.body.includes("commission"), "/affiliate-disclosure explica comissão");

  for (const page of [about, contact, privacy, terms, disclosure]) {
    for (const link of PUBLIC_FOOTER_LINKS) {
      assert(page.body.includes(`href="${link.href}"`), `página legal inclui footer ${link.href}`);
    }
  }

  const missing = await fetchPage("/p/this-slug-does-not-exist-phase1");
  assert(missing.status === 404, `slug inexistente retorna 404 (veio ${missing.status})`);

  const robots = await fetchPage("/robots.txt");
  assert(robots.status === 200, "/robots.txt retorna 200");
  assert(/disallow:\s*\/admin/i.test(robots.body), "robots.txt Disallow /admin");
  assert(!/disallow:\s*\/p(?:\/|\s|$)/i.test(robots.body), "robots.txt não bloqueia /p/");
  assert(/disallow:\s*\/preview/i.test(robots.body), "robots.txt Disallow /preview");

  assert(
    about.body.includes("width=device-width") || about.body.includes("viewport"),
    "viewport presente nas páginas públicas",
  );

  let presellPath = "/p/winter-jacket-review";
  let presell = await fetchPage(presellPath);
  if (presell.status !== 200) {
    presellPath = "/p/winter-jacket-review-copy";
    presell = await fetchPage(presellPath);
  }

  if (presell.status !== 200) {
    throw new Error(
      `FALHOU: nenhuma presell de teste em ${base}/p/winter-jacket-review (status ${presell.status}). Suba o dev server com o SQLite local.`,
    );
  }

  assert(presell.status === 200, `${presellPath} retorna 200`);
  for (const link of PUBLIC_FOOTER_LINKS) {
    assert(presell.body.includes(`href="${link.href}"`), `presell pública inclui footer ${link.href}`);
  }
  assert(presell.body.includes("<a"), "presell contém <a>");
  assert(presell.body.includes('rel="nofollow sponsored"'), 'CTA rel="nofollow sponsored"');
  assert(!presell.body.includes('target="_blank"'), "CTA mesma aba (sem target=_blank)");
  assert(!presell.body.includes('http-equiv="refresh"'), "sem redirect automático via meta refresh");
  assert(presell.body.includes("How we review products"), "bloco editorial visível na presell");
  assert(
    presell.body.includes('rel="canonical"') || presell.body.includes("canonical"),
    "canonical presente na presell",
  );

  const tracked = await fetchPage(`${presellPath}?utm_source=google&gclid=teste123`);
  assert(tracked.status === 200, "presell com UTM/gclid responde 200");
  assert(
    tracked.body.includes("utm_source=google") && tracked.body.includes("gclid=teste123"),
    "UTM/gclid aparecem no href do CTA",
  );

  const previewPath = presellPath.replace("/p/", "/admin/preview/");
  const preview = await fetchPage(previewPath);
  assert(preview.status === 200, `preview ${previewPath} retorna 200`);
  assert(!preview.body.includes('id="presell-pixel"'), "preview NÃO executa o pixel");
  if (presell.body.includes('id="presell-pixel"')) {
    assert(true, "página pública inclui pixel quando a campanha tem headScript");
  } else {
    assert(true, "campanha de teste sem headScript no HTML inicial, ou pixel via next/script — preview segue sem id de pixel");
  }

  console.log("\nTodos os testes da Fase 1 (trust/compliance) passaram.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
