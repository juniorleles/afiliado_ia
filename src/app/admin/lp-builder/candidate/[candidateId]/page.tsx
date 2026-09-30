import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { openBuilderForCandidate } from "@/lib/lp-builder/open-campaign";

export default async function OpenGeneratedBuilderPage({ params }: { params: Promise<{ candidateId: string }> }) {
  await requireAdmin();
  const opened = openBuilderForCandidate((await params).candidateId);
  if (!opened.ok) notFound();
  redirect(`/admin/lp-builder/${opened.campaignId}`);
}
