import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignWorkspace } from "@/app/admin/[id]/edit/workspace";
import { getCampaignById } from "@/lib/campaigns";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign?.name ?? "Campanha" };
}

export default async function EditCampaignPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <CampaignWorkspace id={id} query={await searchParams} />;
}
