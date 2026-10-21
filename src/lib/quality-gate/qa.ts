import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildConversionBrief } from "@/lib/conversion-strategy/build";
import { validateConversionBrief } from "@/lib/conversion-strategy/validate";
import { buildLabContract, labScenarioKeys } from "@/lib/design-system/scenarios";
import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import type { Defect, QaTarget } from "@/lib/quality-gate/types";
import { toPosixRelative } from "@/lib/quality-gate/scope";
import { probeHtmlFile, reviewVisualOptional, staticHtmlDefects } from "@/lib/quality-gate/visual";

export type QaResult = {
  defects: Defect[];
  htmlProbed: boolean;
  playwright: "OK" | "UNAVAILABLE" | "SKIPPED";
  multimodal: ReturnType<typeof reviewVisualOptional>;
  notes: string[];
};

function tscFile(filePath: string, tmpDir: string, workspaceRoot: string): { ok: boolean; output: string } {
  mkdirSync(tmpDir, { recursive: true });
  const cfg = path.join(tmpDir, "tsconfig.isolated.json");
  const relFromCfg = path.relative(tmpDir, filePath).replace(/\\/g, "/");
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2017",
          module: "esnext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          isolatedModules: true,
        },
        files: [relFromCfg],
      },
      null,
      2,
    ),
  );
  const result = spawnSync("npx", ["tsc", "-p", cfg, "--pretty", "false"], {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    cwd: workspaceRoot,
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() };
}

function auditClaimDocument(file: string): Defect[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    claims?: Array<{ text?: string; class?: string; restriction?: string; evidenceRefs?: string[] }>;
    cta?: { state?: string; href?: string };
    offers?: unknown[];
  };
  const defects: Defect[] = [];
  const forbidden = /clinically proven|doctors worldwide|verified buyer|testimonial|limited time|%\s*off/i;
  for (const [i, claim] of (raw.claims ?? []).entries()) {
    const refs = claim.evidenceRefs ?? [];
    if (claim.class === "FACT" && claim.restriction === "PUBLISHABLE" && refs.length === 0) {
      defects.push({
        id: `ungrounded-${i}`,
        kind: "UNGROUNDED_CLAIM",
        severity: "BLOCKING",
        gate: "CONTENT_GROUNDING_GATE",
        message: `publishable fact has no evidence: ${claim.text ?? "(empty)"}`,
        evidence: [file],
        files: [file],
        fixable: false,
        acceptance: "a publishable claim must keep a verifiable evidence reference",
      });
    }
    if (claim.text && forbidden.test(claim.text)) {
      defects.push({
        id: `invented-${i}`,
        kind: "UNGROUNDED_CLAIM",
        severity: "BLOCKING",
        gate: "CONTENT_GROUNDING_GATE",
        message: "forbidden commercial invention",
        evidence: [claim.text],
        files: [file],
        fixable: false,
        acceptance: "the engine must not invent medical results, testimonials or discounts",
      });
    }
  }
  if (raw.cta?.state === "AUTHORIZED" && raw.cta.href && (!(raw.offers ?? []).length)) {
    defects.push({
      id: "cta-without-offer",
      kind: "AUTHORIZATION",
      severity: "BLOCKING",
      gate: "COMMERCIAL_AUTHORIZATION_GATE",
      message: "authorized hop without a verified offer is not invented here — flag for review",
      evidence: [file],
      files: [file],
      fixable: false,
      acceptance: "commercial hops stay behind existing authorization gates",
    });
  }
  return defects;
}

export function auditLabConversionBriefs(): Defect[] {
  const defects: Defect[] = [];
  for (const key of labScenarioKeys()) {
    const contract = buildLabContract(key);
    if (!contract) {
      defects.push({
        id: `brief-missing-${key}`,
        kind: "CONVERSION_BRIEF",
        severity: "BLOCKING",
        gate: "CONTENT_GROUNDING_GATE",
        message: `lab contract ${key} is missing`,
        evidence: [key],
        files: [],
        fixable: false,
        acceptance: "the six synthetic contracts must still build",
      });
      continue;
    }
    const brief = buildConversionBrief(contract);
    const check = validateConversionBrief(brief, contract);
    if (!check.ok) {
      defects.push({
        id: `brief-${key}`,
        kind: "CONVERSION_BRIEF",
        severity: "BLOCKING",
        gate: "CONTENT_GROUNDING_GATE",
        message: `${key} brief failed: ${check.violations.map((v) => v.message).join("; ")}`,
        evidence: check.violations.map((v) => `${v.path}: ${v.message}`),
        files: [],
        fixable: false,
        acceptance: "Conversion Brief integrity must hold on the six synthetic scenarios",
      });
    }
    if (brief.ctaStrategy.action === "AUTHORIZED_HOP" && !purchaseCtaAllowed(contract)) {
      defects.push({
        id: `cta-${key}`,
        kind: "INVALID_CTA",
        severity: "BLOCKING",
        gate: "COMMERCIAL_AUTHORIZATION_GATE",
        message: `${key} brief hops without purchaseCtaAllowed`,
        evidence: [key],
        files: [],
        fixable: false,
        acceptance: "commercial CTAs stay behind existing authorization gates",
      });
    }
  }
  return defects;
}

export async function runQa(input: {
  targets: QaTarget[];
  workspaceRoot: string;
  evidenceDir: string;
}): Promise<QaResult> {
  const defects: Defect[] = [];
  const notes: string[] = [];
  let htmlProbed = false;
  let playwright: QaResult["playwright"] = "SKIPPED";
  const multimodal = reviewVisualOptional();
  notes.push(multimodal.reason);

  for (const target of input.targets) {
    if (target.kind === "typescript-file") {
      const abs = path.resolve(input.workspaceRoot, target.path);
      const check = tscFile(abs, path.join(input.evidenceDir, "tsc"), input.workspaceRoot);
      if (!check.ok) {
        defects.push({
          id: "typescript-isolated",
          kind: "TYPESCRIPT",
          severity: "BLOCKING",
          gate: "TECHNICAL_GATE",
          message: "isolated TypeScript check failed",
          evidence: [check.output.slice(0, 800)],
          files: [toPosixRelative(abs, input.workspaceRoot)],
          fixable: true,
          acceptance: "the isolated fixture must typecheck",
        });
      }
    }

    if (target.kind === "project-typescript") {
      const result = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
        encoding: "utf8",
        shell: true,
        windowsHide: true,
        cwd: input.workspaceRoot,
      });
      if (result.status !== 0) {
        defects.push({
          id: "typescript-project",
          kind: "TYPESCRIPT",
          severity: "BLOCKING",
          gate: "TECHNICAL_GATE",
          message: "project TypeScript check failed",
          evidence: [`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(0, 800)],
          files: [],
          fixable: false,
          acceptance: "the project must typecheck",
        });
      }
    }

    if (target.kind === "html-page") {
      htmlProbed = true;
      const abs = path.resolve(input.workspaceRoot, target.path);
      if (!existsSync(abs)) {
        defects.push({
          id: "html-missing",
          kind: "LOAD_FAILURE",
          severity: "BLOCKING",
          gate: "TECHNICAL_GATE",
          message: `HTML fixture missing: ${target.path}`,
          evidence: [target.path],
          files: [target.path],
          fixable: false,
          acceptance: "the isolated HTML fixture must exist",
        });
        continue;
      }
      const probed = await probeHtmlFile({
        file: abs,
        evidenceDir: input.evidenceDir,
        capture: target.capture !== false,
        workspaceRoot: input.workspaceRoot,
      });
      playwright = probed.playwright;
      defects.push(...probed.defects);
      if (probed.playwright === "UNAVAILABLE") {
        notes.push("Playwright unavailable — static HTML analysis still ran");
        defects.push(...staticHtmlDefects(readFileSync(abs, "utf8"), toPosixRelative(abs, input.workspaceRoot)).filter((item) => !defects.some((d) => d.kind === item.kind && d.id === item.id)));
      }
    }

    if (target.kind === "claim-document") {
      const abs = path.resolve(input.workspaceRoot, target.path);
      defects.push(...auditClaimDocument(abs));
    }

    if (target.kind === "out-of-scope-request") {
      defects.push({
        id: "out-of-scope",
        kind: "OUT_OF_SCOPE",
        severity: "BLOCKING",
        gate: "COMMERCIAL_AUTHORIZATION_GATE",
        message: `proposed change is outside the fix allowlist: ${target.path}`,
        evidence: [target.proposedPatch.reason],
        files: [target.path],
        fixable: false,
        acceptance: "authorization policy, campaigns, secrets and public LPs are not editable",
      });
    }

    if (target.kind === "conversion-briefs") {
      defects.push(...auditLabConversionBriefs());
    }

    if (target.kind === "evidence-files") {
      for (const name of target.required) {
        const dest = path.join(input.workspaceRoot, target.directory, name);
        if (!existsSync(dest)) {
          defects.push({
            id: `evidence-${name}`,
            kind: "MISSING_EVIDENCE_FILE",
            severity: "BLOCKING",
            gate: "TECHNICAL_GATE",
            message: `required evidence file missing: ${name}`,
            evidence: [dest],
            files: [path.posix.join(target.directory.replace(/\\/g, "/"), name)],
            fixable: false,
            acceptance: "required evidence files must exist after the run",
          });
        }
      }
    }
  }

  return { defects, htmlProbed, playwright, multimodal, notes };
}
