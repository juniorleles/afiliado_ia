import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { labScenarioKeys } from "@/lib/design-system/scenarios";
import { buildV4Model } from "@/lib/product-showcase/v4/model";
import { V4Shell } from "@/components/product-showcase/v4/shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Renderer V4 lab scenario",
  robots: { index: false, follow: false },
};

export default async function RendererV4ScenarioPage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  if (!labScenarioKeys().includes(scenario)) notFound();
  const model = buildV4Model(scenario);
  if (!model) notFound();
  return <V4Shell model={model} />;
}
