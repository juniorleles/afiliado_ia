import type { V4Model } from "@/lib/product-showcase/v4/model";
import { SANDBOX_CTA_LABEL, type PreparedSandboxCta, type SandboxSession } from "@/lib/sandbox/types";
import { isSandboxCtaHref, rejectExternalSandboxHref } from "@/lib/sandbox/href";
import { overlaySandboxAssets } from "@/lib/sandbox/assets";
import type { ProductCatalog } from "@/lib/real-product-assets/types";

export function prepareSandboxCta(input: {
  lab: boolean;
  href: string | null;
  session?: SandboxSession | null;
}): PreparedSandboxCta {
  const blocked = { visible: false, label: null, href: null, badge: null, productionBlocked: true as const };
  if (!input.lab) {
    return { ...blocked, reason: "Sandbox CTAs are lab-only." };
  }
  if (!input.session) {
    return { ...blocked, reason: "No sandbox session is registered." };
  }
  if (!input.href || !isSandboxCtaHref(input.href)) {
    return { ...blocked, reason: "The sandbox CTA must use a local simulation path." };
  }
  const safe = rejectExternalSandboxHref(input.href);
  if (!safe.ok) {
    return { ...blocked, reason: "External commercial destinations are not allowed for sandbox CTAs." };
  }
  return {
    visible: true,
    label: SANDBOX_CTA_LABEL,
    href: safe.href,
    badge: "SANDBOX",
    reason: "Lab sandbox CTA is armed for a local simulation.",
    productionBlocked: true,
  };
}

export function applySandboxToModel(
  model: V4Model,
  input: { href: string; catalog?: ProductCatalog | null },
): V4Model {
  if (!isSandboxCtaHref(input.href)) return model;
  const overlayed = input.catalog ? overlaySandboxAssets(model, input.catalog) : model;
  return {
    ...overlayed,
    hopSlot: "hero",
    hopHref: input.href,
    hopLabel: SANDBOX_CTA_LABEL,
    sandbox: { mode: true },
  };
}
