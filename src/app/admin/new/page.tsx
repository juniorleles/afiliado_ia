import { CampaignForm } from "@/app/admin/campaign-form";
import { createCampaignAction } from "@/app/admin/actions";

export default function NewCampaignPage() {
  return (
    <div>
      <h2 className="mb-6 text-xl font-medium">Nova campanha</h2>
      <CampaignForm action={createCampaignAction} submitLabel="Criar" />
    </div>
  );
}
