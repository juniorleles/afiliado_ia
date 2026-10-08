"use client";

import { deleteCampaignAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export function DeleteButton({ id, name, appearance = "menu" }: { id: number; name: string; appearance?: "menu" | "button" }) {
  return (
    <form
      className={appearance === "button" ? "inline" : undefined}
      action={deleteCampaignAction.bind(null, id)}
      onSubmit={(event) => {
        if (!window.confirm(`Excluir a campanha “${name}”?`)) {
          event.preventDefault();
        }
      }}
    >
      {appearance === "button" ? (
        <Button type="submit" variant="danger" aria-label={`Excluir ${name}`}>Excluir</Button>
      ) : (
        <button
          type="submit"
          role="menuitem"
          className="flex w-full rounded-ds-sm px-ds-12 py-ds-8 text-left text-body text-danger outline-none hover:bg-secondary focus-visible:shadow-ds-focus"
        >
          Excluir
        </button>
      )}
    </form>
  );
}
