"use client";

import { unpublishCampaignAction } from "@/app/admin/actions";

export function UnpublishButton({ id, name }: { id: number; name: string }) {
  return (
    <form
      action={unpublishCampaignAction.bind(null, id)}
      onSubmit={(event) => {
        if (!window.confirm(`Retirar “${name}” da publicação? A página pública passa a responder 404. A prévia continua disponível.`)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-body text-amber-800 hover:underline">
        Retirar publicação
      </button>
    </form>
  );
}
