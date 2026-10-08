import { readFileSync } from "node:fs";
import { join } from "node:path";

const SEARCH_KEY = "SEARCHAPI_API_KEY";
const GOOGLE_KEYS = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
] as const;

export type IntegrationConfiguration = {
  searchApi: "SET" | "MISSING";
  googleAds: "Not Connected" | "Connected";
  demoPublish: "SET" | "MISSING";
  language: "pt-BR";
  publicLanguage: "en";
};

function fileText(): string {
  try {
    return readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return "";
  }
}

function present(name: string, text: string): boolean {
  const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
  const fromFile = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  const fromEnv = process.env[name]?.trim() ?? "";
  return fromFile !== "" || fromEnv !== "";
}

/** Presence only. The returned object never contains a secret value. */
export function readIntegrationConfiguration(): IntegrationConfiguration {
  const text = fileText();
  const googleReady = GOOGLE_KEYS.every((name) => present(name, text));
  return {
    searchApi: present(SEARCH_KEY, text) ? "SET" : "MISSING",
    googleAds: googleReady ? "Connected" : "Not Connected",
    demoPublish: present("DEMO_PUBLISH", text) ? "SET" : "MISSING",
    language: "pt-BR",
    publicLanguage: "en",
  };
}
