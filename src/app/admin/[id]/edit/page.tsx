import { notFound } from "next/navigation";
import { CampaignForm } from "@/app/admin/campaign-form";
import { updateCampaignAction } from "@/app/admin/actions";
import { getCampaignById } from "@/lib/campaigns";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCampaignPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  const campaign = getCampaignById(id);
  if (!campaign) {
    notFound();
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-medium">Editar campanha</h2>
      <CampaignForm
        action={updateCampaignAction.bind(null, campaign.id)}
        campaign={campaign}
        submitLabel="Salvar"
        unpublishOnSave={campaign.publicationStatus === "published"}
      />
    </div>
  );
}
