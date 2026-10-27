export { SANDBOX_VERSION, SANDBOX_CTA_LABEL, SANDBOX_EVENT, SANDBOX_PATH_PREFIX } from "@/lib/sandbox/types";
export type {
  PreparedSandboxCta,
  SandboxClick,
  SandboxClickResult,
  SandboxGeneration,
  SandboxSession,
} from "@/lib/sandbox/types";
export { isSandboxCtaHref, buildSandboxCtaPath, rejectExternalSandboxHref } from "@/lib/sandbox/href";
export { prepareSandboxCta, applySandboxToModel } from "@/lib/sandbox/cta";
export { recordSandboxClick } from "@/lib/sandbox/track";
export {
  DEFAULT_SANDBOX_ROOT,
  DEFAULT_SANDBOX_ASSET_ROOT,
  readSandboxSession,
  writeSandboxSession,
  readSandboxClicks,
} from "@/lib/sandbox/store";
export { overlaySandboxAssets, simulateSandboxApprovals, realCatalogApprovalsUnchanged, publicSandboxSrcFor } from "@/lib/sandbox/assets";
export { extractHopCandidates } from "@/lib/sandbox/hops";
export type { HopCandidate } from "@/lib/sandbox/hops";
export { sandboxMayPromoteToProduction, productionPublicationBlockedForSandbox, sandboxPromotionDecision } from "@/lib/sandbox/promote";
