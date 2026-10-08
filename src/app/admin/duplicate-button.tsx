"use client";

import { duplicateCampaignAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export function DuplicateButton({ id, name }: { id: number; name: string }) {
  return (
    <form className="inline" action={duplicateCampaignAction.bind(null, id)}>
      <Button type="submit" variant="secondary" aria-label={`Duplicar ${name}`}>
        Duplicar
      </Button>
    </form>
  );
}
