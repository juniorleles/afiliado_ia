/**
 * Host record domain: SearchApi client.
 *
 * Performs one retrieval against SearchApi and returns the response text.
 * The API key is read from .env.local. It is not written into the query.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SearchApiDevice } from "./searchapi-types";

export const SEARCHAPI_ENDPOINT = "https://www.searchapi.io/api/v1/search";

export interface SearchApiClientRequest {
  keyword: string;
  country: string;
  language: string;
  device: SearchApiDevice;
  searchOptions: Record<string, string>;
}

export interface SearchApiClientResult {
  httpStatus: number;
  bodyText: string;
}

export type SearchApiTransport = (url: string, headers: Record<string, string>) => Promise<SearchApiClientResult>;

export type SearchApiKeyReader = () => string;

export interface SearchApiClient {
  request(input: SearchApiClientRequest): Promise<SearchApiClientResult>;
}

export function readSearchApiKey(envPath = join(process.cwd(), ".env.local")): string {
  try {
    const text = readFileSync(envPath, "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith("SEARCHAPI_API_KEY="));
    if (!line) return "";
    return line.slice("SEARCHAPI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

const defaultTransport: SearchApiTransport = async (url, headers) => {
  const response = await fetch(url, { method: "GET", headers });
  return { httpStatus: response.status, bodyText: await response.text() };
};

export interface SearchApiClientOptions {
  endpoint?: string;
  transport?: SearchApiTransport;
  keyReader?: SearchApiKeyReader;
}

export function createSearchApiClient(options: SearchApiClientOptions = {}): SearchApiClient {
  const endpoint = options.endpoint ?? SEARCHAPI_ENDPOINT;
  const transport = options.transport ?? defaultTransport;
  const keyReader = options.keyReader ?? (() => readSearchApiKey());

  return {
    async request(input) {
      const key = keyReader().trim();
      const url = new URL(endpoint);
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", input.keyword);
      url.searchParams.set("gl", input.country);
      url.searchParams.set("hl", input.language);
      url.searchParams.set("device", input.device);
      for (const [name, value] of Object.entries(input.searchOptions)) url.searchParams.set(name, value);
      if (!key) return { httpStatus: 0, bodyText: "" };
      try {
        return await transport(url.toString(), {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        });
      } catch {
        return { httpStatus: 0, bodyText: "" };
      }
    },
  };
}
