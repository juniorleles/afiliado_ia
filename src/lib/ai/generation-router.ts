/**
 * Canonical generation routing. THIN/INSUFFICIENT copy is deterministic.
 * RICH/ADEQUATE still use the existing model generator.
 *
 * Do not infer the route from missing fields elsewhere. Read GenerationPlan.
 */

import type { GenerationPlan, GenerationRoute } from "@/lib/ai/generation-plan";

export function resolveGenerationRoute(plan: GenerationPlan): GenerationRoute {
  return plan.generationRoute;
}

export function isDeterministicThinRoute(plan: GenerationPlan): boolean {
  return resolveGenerationRoute(plan) === "DETERMINISTIC_THIN";
}
