import type { SandboxGeneration, SandboxSession } from "@/lib/sandbox/types";

export function sandboxMayPromoteToProduction(): false {
  return false;
}

export function productionPublicationBlockedForSandbox(
  record: { sandbox?: SandboxGeneration | null } | SandboxSession | null,
): true {
  void record;
  return true;
}

export function sandboxPromotionDecision(record: { sandbox?: SandboxGeneration | null } | null): {
  allowed: false;
  reason: "SANDBOX_PROMOTION_BLOCKED";
} {
  void record;
  return { allowed: false, reason: "SANDBOX_PROMOTION_BLOCKED" };
}
