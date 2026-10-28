import { MAX_DESIGN_ITERATIONS } from "@/lib/presell-quality/premium-design";

export type DesignImprovement = {
  id: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  component: "hero" | "cta" | "cards" | "guarantee" | "shipping" | "faq" | "footer" | "mobile";
  change: string;
  mutatesApprovedFacts: false;
};

export function planDesignImprovements(input: {
  iteration: number;
  defects: string[];
  visualScore: number | null;
}): { actions: DesignImprovement[]; stop: boolean; reason: string } {
  if (input.iteration >= MAX_DESIGN_ITERATIONS) {
    return { actions: [], stop: true, reason: "Maximum design iterations reached. Status stays QUALITY_BLOCKED." };
  }
  const actions: DesignImprovement[] = [];
  const blob = input.defects.join(" ").toLowerCase();
  if (/overflow|mobile/.test(blob)) {
    actions.push({
      id: "mobile-overflow",
      impact: "HIGH",
      component: "mobile",
      change: "Tighten mobile packing, image max-width, and full-width preview CTA without adding facts.",
      mutatesApprovedFacts: false,
    });
  }
  if (/hero|packshot|first impression/.test(blob) || (input.visualScore != null && input.visualScore < 90)) {
    actions.push({
      id: "hero-hierarchy",
      impact: "HIGH",
      component: "hero",
      change: "Increase packshot dominance and headline contrast using existing copy only.",
      mutatesApprovedFacts: false,
    });
  }
  if (/card|ingredient|shipping/.test(blob)) {
    actions.push({
      id: "card-layout",
      impact: "MEDIUM",
      component: "cards",
      change: "Rebalance card grid for available facts. Omit empty slots instead of inventing fill.",
      mutatesApprovedFacts: false,
    });
  }
  if (!actions.length) {
    return { actions: [], stop: true, reason: "No evidence-backed presentation change remains." };
  }
  return { actions, stop: false, reason: "Apply highest-impact presentation fixes and re-render." };
}
