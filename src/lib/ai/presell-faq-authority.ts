import { createEvidenceSlotPlan } from "@/lib/ai/evidence-slot-plan";
import { deterministicFaqQuestion } from "@/lib/ai/faq-question-semantics";
import { createGenerationPlan } from "@/lib/ai/generation-plan";
import { projectEvidenceClaims } from "@/lib/ai/claim-projection";
import { normalizeFaqQuestion, type FaqAuthorityBinding } from "@/lib/ai/grounding-validator";
import { applyGenericFaqRecovery } from "@/lib/faq-field-promotion";
import { buildGenerationFactManifest, type ProductFacts } from "@/lib/product-facts";
import type { PresellPage } from "@/lib/presell-page";

/**
 * Rebuild page-level FAQ authority from the evidence slot plan.
 * Persisted presell FAQ items keep question and answer only. The slot plan
 * still owns topic, field, and support text. A question binds only when it
 * matches exactly one CODE-owned FAQ question.
 */
export function presellPageFaqAuthorityBindings(page: PresellPage, facts: ProductFacts): FaqAuthorityBinding[] {
  const recovered = applyGenericFaqRecovery(facts);
  const plan = createGenerationPlan(recovered);
  const manifest = buildGenerationFactManifest(recovered);
  const projection = projectEvidenceClaims(recovered, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
  const bindings: FaqAuthorityBinding[] = [];

  for (const section of page.sections) {
    if (!section.visible || section.id !== "faq") continue;
    for (const item of section.faq) {
      const key = normalizeFaqQuestion(item.question);
      if (!key) continue;
      const matches = slotPlan.slots.filter((slot) => {
        if (slot.type !== "FAQ") return false;
        const question = deterministicFaqQuestion(slot, recovered.productName);
        return Boolean(question) && normalizeFaqQuestion(question || "") === key;
      });
      if (matches.length !== 1) continue;
      const slot = matches[0]!;
      const question = deterministicFaqQuestion(slot, recovered.productName);
      if (!question) continue;
      bindings.push({
        question,
        field: slot.evidence[0]?.field,
        topic: slot.topic,
        semanticAuthority: slot.semanticAuthority,
        authorizedTopics: [slot.topic],
        supportText: slot.evidence.map((item) => item.value).join("\n"),
        closedTopics: plan.closedTopics,
        slotId: slot.slotId,
      });
    }
  }

  return bindings;
}
