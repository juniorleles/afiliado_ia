import {
  importProductFromUrl,
  ImportBlockedError,
  ImportFetchError,
  recoverBlockedPrimarySource,
  isRecoverablePrimaryImportError,
  type ImportDependencies,
} from "@/lib/import-product";
import { logEvent } from "@/lib/logger";
import type { ProductFacts } from "@/lib/product-facts";
import { createImportJob, importJobSignal } from "@/lib/source-resolution/progress";

export type ImportProductInput = {
  url: string;
  operatorProductName?: string;
  importId?: string;
};

export type ImportResult =
  | { ok: true; facts: ProductFacts }
  | {
      ok: false;
      error: string;
      needsProductName?: boolean;
      blockReason?: string;
      discoveryAttempted?: boolean;
    };

export function normalizeImportInput(
  input: ImportProductInput | string,
  operatorProductName = "",
): ImportProductInput {
  if (typeof input === "string") {
    return { url: input, operatorProductName };
  }
  return {
    url: input.url,
    operatorProductName: (input.operatorProductName || operatorProductName || "").trim(),
    importId: input.importId,
  };
}

export async function executeGenerateImport(
  input: ImportProductInput,
  deps?: ImportDependencies,
): Promise<ImportResult> {
  const operatorProductName = (input.operatorProductName || "").trim();
  const runId = input.importId || deps?.importId || `diag_${Date.now()}`;
  if (input.importId || runId) createImportJob(input.importId || runId);
  const mergedDeps: ImportDependencies = {
    ...deps,
    importId: input.importId || deps?.importId || runId,
    signal: deps?.signal || importJobSignal(input.importId || runId),
  };
  const importStarted = Date.now();
  logEvent("INFO", "IMPORT", "IMPORT_START", {
    runId,
    timestamp: new Date().toISOString(),
    url: input.url,
    operatorProductName: operatorProductName || null,
  });
  const end = (result: string, extra?: Record<string, unknown>) => {
    logEvent("INFO", "IMPORT", "IMPORT_END", {
      runId,
      result,
      totalMs: Date.now() - importStarted,
      ...extra,
    });
  };
  try {
    const facts = await importProductFromUrl(
      input.url,
      { operatorProductName: operatorProductName || undefined },
      mergedDeps,
    );
    end("OK", {
      accepted: facts.webDiscovery?.acceptedCount ?? null,
      outcome: facts.webDiscovery?.outcome ?? "PRIMARY",
    });
    return { ok: true, facts };
  } catch (err) {
    if (err instanceof ImportBlockedError) {
      end("BLOCKED", { blockReason: err.reason, needsProductName: err.needsProductName });
      return {
        ok: false,
        error: err.message,
        needsProductName: err.needsProductName,
        blockReason: err.reason,
        discoveryAttempted: !err.needsProductName,
      };
    }
    if ((err instanceof ImportFetchError || isRecoverablePrimaryImportError(err)) && operatorProductName) {
      try {
        const facts = await recoverBlockedPrimarySource(
          input.url,
          "HTTP_403",
          { operatorProductName },
          mergedDeps,
        );
        end("OK_RECOVERED", {
          accepted: facts.webDiscovery?.acceptedCount ?? null,
          outcome: facts.webDiscovery?.outcome ?? null,
        });
        return { ok: true, facts };
      } catch (inner) {
        if (inner instanceof ImportBlockedError) {
          end("BLOCKED_RECOVER", { blockReason: inner.reason });
          return {
            ok: false,
            error: inner.message,
            needsProductName: inner.needsProductName,
            blockReason: inner.reason,
            discoveryAttempted: !inner.needsProductName,
          };
        }
        end("ERROR_RECOVER", { error: inner instanceof Error ? inner.message : "unknown" });
        return {
          ok: false,
          error: inner instanceof Error ? inner.message : "Erro desconhecido ao importar produto.",
          discoveryAttempted: true,
        };
      }
    }
    end("ERROR", { error: err instanceof Error ? err.message : "unknown" });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido ao importar produto.",
    };
  }
}

