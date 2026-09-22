import { looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";

const MAX_BYTES = 2_000_000;
const FETCH_HEADERS = { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" };

export type ProbedImage = {
  url: string;
  finalUrl: string;
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
  bytes: number;
};

export async function probeRemoteImage(url: string): Promise<ProbedImage | null> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const headerType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    if (looksLikeHtmlOrScript(buffer)) return null;
    const mime = sniffImageMime(buffer) || headerType;
    if (!mime.startsWith("image/")) return null;
    const dims = readImageDimensions(buffer);
    return {
      url,
      finalUrl: response.url || url,
      buffer,
      mime,
      width: dims?.width || 0,
      height: dims?.height || 0,
      bytes: buffer.length,
    };
  } catch {
    return null;
  }
}
