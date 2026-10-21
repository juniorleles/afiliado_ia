import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isCompositionId, themeForComposition } from "@/lib/design-system/compose";
import { buildLabContract, labScenarioKeys } from "@/lib/design-system/scenarios";
import { PrototypeShell } from "@/components/design-system/prototype-shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Design system prototype",
  robots: { index: false, follow: false },
};

export default async function DesignSystemForcedCompositionPage({
  params,
}: {
  params: Promise<{ scenario: string; composition: string }>;
}) {
  const { scenario, composition } = await params;
  if (!labScenarioKeys().includes(scenario) || !isCompositionId(composition)) notFound();
  const contract = buildLabContract(scenario);
  if (!contract) notFound();
  return <PrototypeShell contract={contract} composition={composition} theme={themeForComposition(composition)} scenario={scenario} />;
}
