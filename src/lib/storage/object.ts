import { createHash, createHmac } from "node:crypto";

export type StoredObject = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type MediaStorageKind = "LOCAL" | "OBJECT_STORAGE";

export type MediaStorage = {
  kind: MediaStorageKind;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
};

function amzDate(now: Date): { amz: string; date: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export async function s3SignedRequest(input: {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
  now?: Date;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const bucket = process.env.S3_BUCKET?.trim();
  const access = process.env.S3_ACCESS_KEY_ID?.trim();
  const secret = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !access || !secret) throw new Error("Object storage is not configured.");
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const endpoint = (process.env.S3_ENDPOINT?.trim() || `https://s3.${region}.amazonaws.com`).replace(/\/$/, "");
  const url = new URL(`${endpoint}/${bucket}/${input.key.split("/").map(encodeURIComponent).join("/")}`);
  const now = input.now || new Date();
  const { amz, date } = amzDate(now);
  const payloadHash = sha256Hex(input.body || Buffer.alloc(0));
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (input.contentType && input.method === "PUT") headers["content-type"] = input.contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonical = [
    input.method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(secret, date, region, "s3")).update(stringToSign, "utf8").digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: url.toString(), headers };
}

export function createObjectStorage(): MediaStorage {
  return {
    kind: "OBJECT_STORAGE",
    async put(key, body, contentType) {
      const signed = await s3SignedRequest({ method: "PUT", key, body, contentType });
      const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: new Uint8Array(body) });
      if (!res.ok) throw new Error(`Object storage put failed (${res.status}).`);
    },
    async get(key) {
      const signed = await s3SignedRequest({ method: "GET", key });
      const res = await fetch(signed.url, { method: "GET", headers: signed.headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Object storage get failed (${res.status}).`);
      const body = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "application/octet-stream";
      return { key, body, contentType };
    },
    async delete(key) {
      const signed = await s3SignedRequest({ method: "DELETE", key });
      const res = await fetch(signed.url, { method: "DELETE", headers: signed.headers });
      if (!res.ok && res.status !== 404) throw new Error(`Object storage delete failed (${res.status}).`);
    },
    async exists(key) {
      const signed = await s3SignedRequest({ method: "HEAD", key });
      const res = await fetch(signed.url, { method: "HEAD", headers: signed.headers });
      return res.ok;
    },
  };
}
