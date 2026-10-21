import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertFixPathAllowed, toPosixRelative } from "@/lib/quality-gate/scope";
import type { Defect, FixAttempt, PatchProposal } from "@/lib/quality-gate/types";

export const SAFE_EDITOR_MODE = "SAFE_SCOPED_PATCH_ONLY" as const;

export type SafeEditorAvailability = {
  mode: typeof SAFE_EDITOR_MODE;
  autonomousAiEditing: false;
  scopedPatchExecutor: true;
  note: string;
};

export function safeEditorAvailability(): SafeEditorAvailability {
  return {
    mode: SAFE_EDITOR_MODE,
    autonomousAiEditing: false,
    scopedPatchExecutor: true,
    note: "A deterministic patch applier may write only allowlisted fixture copies. It does not execute model-generated commands and is not a general code editor.",
  };
}

function hashText(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

export function unifiedDiff(rel: string, before: string, after: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const lines = [`--- a/${rel}`, `+++ b/${rel}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`-${a[i]}`);
    if (b[i] !== undefined) lines.push(`+${b[i]}`);
  }
  return lines.join("\n");
}

export function proposeFix(defect: Defect, workspaceRoot: string): { patches: PatchProposal[]; refuse?: string } {
  if (defect.kind === "OUT_OF_SCOPE") {
    return { patches: [], refuse: "out-of-scope paths cannot be patched" };
  }
  if (defect.kind === "UNGROUNDED_CLAIM" || defect.kind === "AUTHORIZATION" || defect.kind === "INVALID_CTA") {
    return { patches: [], refuse: "the fix agent cannot invent evidence, authorization or a commercial hop" };
  }
  if (!defect.fixable) {
    return { patches: [], refuse: "defect is classified as not auto-fixable" };
  }

  const file = defect.files[0];
  if (!file) return { patches: [], refuse: "no file was named" };
  const abs = path.resolve(workspaceRoot, file);
  const allowed = assertFixPathAllowed(abs, workspaceRoot);
  if (!allowed.ok) return { patches: [], refuse: allowed.reason };
  if (!existsSync(abs)) return { patches: [], refuse: "named file does not exist" };
  const text = readFileSync(abs, "utf8");

  if (defect.kind === "TYPESCRIPT") {
    if (text.includes("export const broken: string = 123")) {
      return {
        patches: [
          {
            path: allowed.rel,
            oldString: "export const broken: string = 123;",
            newString: "export const broken: number = 123;",
            reason: "align the annotation with the numeric literal",
          },
        ],
      };
    }
    return { patches: [], refuse: "no safe TypeScript recipe matched" };
  }

  if (defect.kind === "OVERFLOW") {
    if (/width:\s*2400px/i.test(text)) {
      return {
        patches: [
          {
            path: allowed.rel,
            oldString: "body { margin: 0; font-family: Georgia, serif; background: #f5f6f8; color: #101828; }\n    main { padding: 24px; }\n    .wide { width: 2400px; background: #eceff4; padding: 24px; }",
            newString: "html, body { margin: 0; overflow-x: hidden; font-family: Georgia, serif; background: #f5f6f8; color: #101828; }\n    main { padding: 24px; box-sizing: border-box; max-width: 100%; }\n    .wide { width: 100%; max-width: 100%; box-sizing: border-box; background: #eceff4; padding: 24px; }",
            reason: "stop the fixture from forcing a horizontal scroll",
          },
        ],
      };
    }
    if (/max-width:\s*100%/.test(text) && !/overflow-x:\s*hidden/.test(text) && /body \{ margin: 0;/.test(text)) {
      return {
        patches: [
          {
            path: allowed.rel,
            oldString: "body { margin: 0;",
            newString: "html, body { margin: 0; overflow-x: hidden;",
            reason: "clip residual padding overflow after the width was corrected",
          },
        ],
      };
    }
    return { patches: [], refuse: "no safe overflow recipe matched" };
  }

  if (defect.kind === "LOW_CONTRAST") {
    if (/#c5c5c5/.test(text) && /#d0d0d0/.test(text)) {
      return {
        patches: [
          {
            path: allowed.rel,
            oldString: "color: #c5c5c5; background: #d0d0d0;",
            newString: "color: #101828; background: #ffffff;",
            reason: "raise CTA contrast above 4.5:1",
          },
        ],
      };
    }
    return { patches: [], refuse: "no safe contrast recipe matched" };
  }

  if (defect.kind === "INVISIBLE_ELEMENT" && /hidden/.test(text)) {
    return {
      patches: [
        {
          path: allowed.rel,
          oldString: " hidden",
          newString: "",
          reason: "restore visibility of the essential element",
        },
      ],
    };
  }

  return { patches: [], refuse: `no deterministic recipe for ${defect.kind}` };
}

export function applyPatches(input: {
  patches: PatchProposal[];
  workspaceRoot: string;
  expectedHashes?: Record<string, string>;
}): { ok: boolean; attempts: FixAttempt[]; changedFiles: string[] } {
  const attempts: FixAttempt[] = [];
  const changedFiles: string[] = [];
  for (const patch of input.patches) {
    const allowed = assertFixPathAllowed(patch.path, input.workspaceRoot);
    if (!allowed.ok) {
      attempts.push({
        defectId: "apply",
        attempt: 1,
        status: "REJECTED_SCOPE",
        patches: [patch],
        reason: allowed.reason,
      });
      continue;
    }
    const abs = path.resolve(input.workspaceRoot, allowed.rel);
    if (!existsSync(abs)) {
      attempts.push({
        defectId: "apply",
        attempt: 1,
        status: "FAILED",
        patches: [patch],
        reason: "file does not exist",
      });
      continue;
    }
    const before = readFileSync(abs, "utf8");
    const beforeHash = hashText(before);
    if (input.expectedHashes?.[allowed.rel] && input.expectedHashes[allowed.rel] !== beforeHash) {
      attempts.push({
        defectId: "apply",
        attempt: 1,
        status: "FAILED",
        patches: [patch],
        beforeHash,
        reason: "file changed since the work copy was taken — refusing to overwrite operator edits",
      });
      continue;
    }
    const count = before.split(patch.oldString).length - 1;
    if (count !== 1) {
      attempts.push({
        defectId: "apply",
        attempt: 1,
        status: "FAILED",
        patches: [patch],
        beforeHash,
        reason: count === 0 ? "oldString was not found" : "oldString is not unique",
      });
      continue;
    }
    const after = before.replace(patch.oldString, patch.newString);
    writeFileSync(abs, after, "utf8");
    const afterHash = hashText(after);
    changedFiles.push(allowed.rel);
    attempts.push({
      defectId: "apply",
      attempt: 1,
      status: "APPLIED",
      patches: [patch],
      diff: unifiedDiff(allowed.rel, before, after),
      beforeHash,
      afterHash,
      reason: patch.reason,
    });
  }
  return { ok: attempts.length > 0 && attempts.every((item) => item.status === "APPLIED"), attempts, changedFiles };
}

const attemptCounts = new Map<string, number>();

export function resetAttemptCounts(): void {
  attemptCounts.clear();
}

export function attemptFix(input: {
  defect: Defect;
  workspaceRoot: string;
  maxAttempts: number;
  expectedHashes?: Record<string, string>;
}): FixAttempt {
  const next = (attemptCounts.get(input.defect.id) ?? 0) + 1;
  if (next > input.maxAttempts) {
    return {
      defectId: input.defect.id,
      attempt: next,
      status: "EXHAUSTED",
      patches: [],
      reason: `attempt limit ${input.maxAttempts} reached`,
    };
  }
  attemptCounts.set(input.defect.id, next);

  if (input.defect.kind === "OUT_OF_SCOPE") {
    return {
      defectId: input.defect.id,
      attempt: next,
      status: "REJECTED_SCOPE",
      patches: [],
      reason: "authorization, campaigns, secrets and public routes are outside the fix allowlist",
    };
  }

  const proposed = proposeFix(input.defect, input.workspaceRoot);
  if (proposed.refuse) {
    return {
      defectId: input.defect.id,
      attempt: next,
      status: "REJECTED_POLICY",
      patches: [],
      reason: proposed.refuse,
    };
  }

  const applied = applyPatches({
    patches: proposed.patches,
    workspaceRoot: input.workspaceRoot,
    expectedHashes: input.expectedHashes,
  });
  const first = applied.attempts[0];
  return {
    defectId: input.defect.id,
    attempt: next,
    status: first?.status ?? "FAILED",
    patches: proposed.patches,
    diff: first?.diff,
    beforeHash: first?.beforeHash,
    afterHash: first?.afterHash,
    reason: first?.reason ?? "no patch was applied",
  };
}

export function fileHash(absPath: string): string {
  return hashText(readFileSync(absPath));
}

export function relativeHash(rel: string, workspaceRoot: string): string {
  return fileHash(path.resolve(workspaceRoot, rel));
}

export { toPosixRelative };
