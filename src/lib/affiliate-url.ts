/**
 * Repassa pro link de afiliado os parâmetros de rastreio que chegaram na
 * URL da presell — é assim que o clique do anúncio (Google/Meta) segue
 * "junto" até a rede de afiliados: o parâmetro de rastreio do anúncio
 * chega em /p/[slug]?utm_source=...&gclid=..., e esse mesmo dado precisa
 * seguir pro link de afiliado, senão a rede não sabe de onde veio a venda.
 *
 * Função pura, sem depender de nada do Next.js — testável isolada.
 */

const FORWARDED_PARAM_PREFIXES = ["utm_"];
const FORWARDED_PARAM_EXACT = ["gclid", "fbclid", "msclkid"];

function shouldForward(key: string): boolean {
  return (
    FORWARDED_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    FORWARDED_PARAM_EXACT.includes(key)
  );
}

export function buildAffiliateHref(
  affiliateUrl: string,
  incomingParams: URLSearchParams,
): string {
  let url: URL;
  try {
    url = new URL(affiliateUrl);
  } catch {
    // affiliateUrl malformada — não trava a página inteira por isso,
    // devolve o valor bruto sem UTM (melhor um link sem rastreio do que
    // nenhum link).
    return affiliateUrl;
  }

  for (const [key, value] of incomingParams.entries()) {
    if (shouldForward(key)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
