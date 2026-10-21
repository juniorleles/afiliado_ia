import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pickComposition, themeForComposition } from "@/lib/design-system/compose";
import { buildLabContract, labScenarioKeys } from "@/lib/design-system/scenarios";
import { PrototypeShell } from "@/components/design-system/prototype-shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Design system prototype",
  robots: { index: false, follow: false },
};

export default async function DesignSystemScenarioPage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  if (!labScenarioKeys().includes(scenario)) notFound();
  const contract = buildLabContract(scenario);
  if (!contract) notFound();
  const composition = pickComposition(contract);
  return <PrototypeShell contract={contract} composition={composition} theme={themeForComposition(composition)} scenario={scenario} />;
}
