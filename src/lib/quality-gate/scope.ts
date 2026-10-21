import path from "node:path";

export const FIX_ALLOW_PREFIXES = [
  "scripts/fixtures/quality-gate/work/",
  "data/evidence/execution-50d-ai-quality-gate/work/",
] as const;

export const FIX_DENY_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)secrets?(\/|$)/i,
  /presell-os\.db$/i,
  /product-assets\/authorization/i,
  /product-contract\//i,
  /src\/app\/p\//i,
  /src\/app\/visual-frame\//i,
  /src\/lib\/campaigns/i,
  /google-ads-live\//i,
  /scripts\/test-/i,
  /node_modules\//i,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.cursor(\/|$)/,
];

export function toPosixRelative(absOrRel: string, workspaceRoot: string): string {
  const abs = path.isAbsolute(absOrRel) ? absOrRel : path.resolve(workspaceRoot, absOrRel);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return abs.replace(/\\/g, "/");
  return rel.replace(/\\/g, "/");
}

export function pathDenied(relPosix: string): string | null {
  for (const pattern of FIX_DENY_PATTERNS) {
    if (pattern.test(relPosix)) return `path is denied: ${relPosix}`;
  }
  return null;
}

export function pathAllowedForFix(relPosix: string): { ok: true } | { ok: false; reason: string } {
  const denied = pathDenied(relPosix);
  if (denied) return { ok: false, reason: denied };
  if (FIX_ALLOW_PREFIXES.some((prefix) => relPosix.startsWith(prefix))) return { ok: true };
  return { ok: false, reason: `path is outside the fix allowlist: ${relPosix}` };
}

export function assertFixPathAllowed(
  target: string,
  workspaceRoot: string,
): { ok: true; rel: string } | { ok: false; reason: string; rel: string } {
  const rel = toPosixRelative(target, workspaceRoot);
  const allowed = pathAllowedForFix(rel);
  if (!allowed.ok) return { ok: false, reason: allowed.reason, rel };
  return { ok: true, rel };
}
