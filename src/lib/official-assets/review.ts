import { looksLikeAvatar } from "@/lib/assets/classify";
import { looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";
import { isConsumerHealthClaim, isPendingHealthClaim } from "@/lib/landing-composer/present";

const PROMO_PROMISE = /\b(?:overnight|first night|rinses out|clears out|poop out|immortal|healthiest|#\s*1|number one|testimonial|verified buyer)\b/i;

export function productNameInAsset(productName: string, url: string, fileName: string): "confirmed" | "unconfirmed" {
  const token = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .find((part) => part.length >= 4 && part !== "capsule" && part !== "supplement");
  if (!token) return "unconfirmed";
  const haystack = decodeURIComponent(`${url} ${fileName}`).toLowerCase();
  return haystack.includes(token) ? "confirmed" : "unconfirmed";
}

/** Filename and alt only. Image permission is not medical-claim evidence. */
export function promoImageLandingBlock(text: string): string | null {
  const decoded = decodeURIComponent(text).replace(/[-_+]/g, " ");
  if (isConsumerHealthClaim(decoded) || isPendingHealthClaim(decoded)) {
    return "Alegação de saúde no nome ou no texto associado ao arquivo.";
  }
  if (PROMO_PROMISE.test(decoded) || looksLikeAvatar(decoded)) {
    return "Promessa ou depoimento no nome do arquivo.";
  }
  return null;
}

export function validateOfficialFile(bytes: Buffer): { format: string; width: number; height: number } | { error: string } {
  if (bytes.length < 24 || bytes.length > 8_000_000) return { error: "Tamanho de arquivo inválido." };
  if (looksLikeHtmlOrScript(bytes)) return { error: "O arquivo não é uma imagem." };
  const mime = sniffImageMime(bytes);
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    return { error: "Formato não aceito. Use JPEG, PNG ou WebP." };
  }
  const dimensions = readImageDimensions(bytes);
  if (!dimensions || dimensions.width < 80 || dimensions.height < 80) return { error: "Dimensões insuficientes." };
  const ratio = dimensions.width / dimensions.height;
  if (ratio > 4 || ratio < 0.25) return { error: "Proporção incompatível com um packshot." };
  return { format: dimensions.format, width: dimensions.width, height: dimensions.height };
}

export function permissionEvidence(section: "product" | "campaign", sourcePage: string, verifiedAt: string): string {
  const label = section === "product" ? "Product Images" : "Campaign Images";
  return `O fabricante listou este arquivo na seção ${label} de ${sourcePage}. A permissão cobre o uso promocional do arquivo e não comprova alegação médica. Verificado em ${verifiedAt}.`;
}
