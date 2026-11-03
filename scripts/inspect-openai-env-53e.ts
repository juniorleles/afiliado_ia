// npx tsx scripts/inspect-openai-env-53e.ts
// Local key-source inspection only. Never prints secrets. Never calls OpenAI.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OPENAI_RESPONSES_URL, OPENAI_TEXT_MODEL, envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { readLedger, budgetStore, EXECUTION_53C_ID, EXECUTION_53D_ID } from "../src/lib/lp-generator/ai-copy/budget.ts";

const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53e-openai-key-validation");

function fingerprint(value: string | null | undefined): {
  present: boolean;
  length: number;
  sha25612: string | null;
  prefixClass: string | null;
  quoted: boolean;
  hasWhitespace: boolean;
} {
  const raw = value ?? "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return { present: false, length: 0, sha25612: null, prefixClass: null, quoted: false, hasWhitespace: false };
  }
  const quoted = /^["'].*["']$/.test(raw.trim());
  const unquoted = quoted ? trimmed.slice(1, -1) : trimmed;
  let prefixClass = "other";
  if (unquoted.startsWith("sk-proj-")) prefixClass = "sk-proj";
  else if (unquoted.startsWith("sk-svcacct-")) prefixClass = "sk-svcacct";
  else if (unquoted.startsWith("sk-ant-")) prefixClass = "anthropic";
  else if (unquoted.startsWith("sk-")) prefixClass = "sk";
  return {
    present: true,
    length: unquoted.length,
    sha25612: createHash("sha256").update(unquoted).digest("hex").slice(0, 12),
    prefixClass,
    quoted,
    hasWhitespace: /\s/.test(unquoted),
  };
}

function envFileLines(file: string, name: string): Array<{ index: number; fp: ReturnType<typeof fingerprint> }> {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter((item) => item.line.startsWith(`${name}=`) && !item.line.startsWith("#"))
    .map((item) => ({ index: item.index, fp: fingerprint(item.line.slice(name.length + 1)) }));
}

function fileMeta(rel: string) {
  const file = path.join(process.cwd(), rel);
  if (!existsSync(file)) return { exists: false, rel };
  const st = statSync(file);
  return { exists: true, rel, mtimeIso: st.mtime.toISOString(), bytes: st.size };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const localFile = path.join(process.cwd(), ".env.local");
  const localLines = envFileLines(localFile, "OPENAI_API_KEY");
  const processFp = fingerprint(process.env.OPENAI_API_KEY);
  const lookupFp = fingerprint(envLookup("OPENAI_API_KEY"));
  const first = localLines[0]?.fp ?? fingerprint("");
  const last = localLines[localLines.length - 1]?.fp ?? fingerprint("");

  const otherFiles = [".env", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]
    .map((rel) => ({ rel, lines: envFileLines(path.join(process.cwd(), rel), "OPENAI_API_KEY") }))
    .filter((item) => item.lines.length > 0);

  const publicFlags = ["AI_PROVIDER", "AI_MODEL", "AIA_ALLOW_PAID_AI"] as const;
  const secretNames = ["OPENAI_PROJECT", "OPENAI_ORG", "OPENAI_ORGANIZATION", "OPENAI_BASE_URL"] as const;
  const flags: Record<string, { process: string; local: string; localCount: number }> = {};
  const text = existsSync(localFile) ? readFileSync(localFile, "utf8") : "";
  for (const name of publicFlags) {
    const local = envFileLines(localFile, name);
    const localVal = local[0] ? text.split(/\r?\n/).find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim() || "" : "(missing)";
    flags[name] = {
      process: process.env[name]?.trim() || "(unset)",
      local: localVal,
      localCount: local.length,
    };
  }
  for (const name of secretNames) {
    const local = envFileLines(localFile, name);
    flags[name] = {
      process: process.env[name]?.trim() ? "(set)" : "(unset)",
      local: local.length ? "(set)" : "(missing)",
      localCount: local.length,
    };
  }

  const providerCode = readFileSync(path.join(process.cwd(), "src/lib/lp-generator/ai-copy/provider.ts"), "utf8");
  const authHeaders = {
    authorizationBearer: /authorization:\s*`Bearer \$\{apiKey\}`/.test(providerCode),
    openaiProjectHeader: /OpenAI-Project/i.test(providerCode),
    openaiOrganizationHeader: /OpenAI-Organization/i.test(providerCode),
    endpoint: OPENAI_RESPONSES_URL,
    endpointOk: OPENAI_RESPONSES_URL === "https://api.openai.com/v1/responses",
  };

  const ledgerC = readLedger(budgetStore(EXECUTION_53C_ID));
  const ledgerD = readLedger(budgetStore(EXECUTION_53D_ID));

  const report = {
    EXECUTION_53E_STATUS: "CONFIG_INSPECTED_NO_API_CALL",
    NEW_KEY_DETECTED: first.present,
    EFFECTIVE_KEY_SOURCE:
      processFp.present && processFp.sha25612 !== first.sha25612
        ? "process.env overrides .env.local"
        : processFp.present && processFp.sha25612 === first.sha25612
          ? "process.env matches .env.local"
          : first.present
            ? ".env.local (envLookup file fallback)"
            : "missing",
    KEY_FINGERPRINT_MATCH: {
      localFirstEqualsLast: first.sha25612 === last.sha25612,
      processEqualsLocalFirst: processFp.present ? processFp.sha25612 === first.sha25612 : null,
      processEqualsLocalLast: processFp.present ? processFp.sha25612 === last.sha25612 : null,
      lookupEqualsLocalFirst: lookupFp.sha25612 === first.sha25612,
      lookupEqualsLocalLast: lookupFp.sha25612 === last.sha25612,
      duplicateLines: localLines.length > 1,
    },
    fingerprints: {
      localFirst: first,
      localLast: last,
      processEnv: processFp,
      envLookupEffective: lookupFp,
      localLineCount: localLines.length,
      localLineNumbers: localLines.map((item) => item.index),
    },
    ENV_OVERRIDE_DETECTED: Boolean(
      (processFp.present && first.present && processFp.sha25612 !== first.sha25612) ||
        localLines.length > 1 ||
        otherFiles.length > 0,
    ),
    otherEnvFilesWithOpenAiKey: otherFiles.map((item) => ({ rel: item.rel, count: item.lines.length, fingerprints: item.lines.map((line) => line.fp.sha25612) })),
    flags,
    AI_PROVIDER: flags.AI_PROVIDER.local || flags.AI_PROVIDER.process || "(missing)",
    AI_MODEL: flags.AI_MODEL.local || flags.AI_MODEL.process || OPENAI_TEXT_MODEL,
    RESPONSES_ENDPOINT_STATUS: authHeaders,
    envFiles: {
      envLocal: fileMeta(".env.local"),
      envExample: fileMeta(".env.example"),
    },
    PREVIOUS_LEDGERS_STATUS: {
      execution53c: ledgerC?.status ?? "MISSING",
      execution53d: ledgerD?.status ?? "MISSING",
      paidRequestCount53c: ledgerC?.paidRequestCount ?? null,
      paidRequestCount53d: ledgerD?.paidRequestCount ?? null,
    },
    PAID_CALLS_ENABLED: flags.AIA_ALLOW_PAID_AI.local === "1" || process.env.AIA_ALLOW_PAID_AI === "1",
    API_REQUEST_COUNT: 0,
  };

  writeFileSync(path.join(EVIDENCE, "key-source-inspection.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
