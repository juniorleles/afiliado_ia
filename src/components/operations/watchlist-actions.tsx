"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useWatchlist } from "@/components/operations/watchlist-provider";
import type { WatchlistItem } from "@/lib/ui/watchlist";

export function WatchlistActions({ item }: { item: WatchlistItem }) {
  const toast = useToast();
  const watchlist = useWatchlist();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(item.notes);
  const landingHref = `/lista/landing-page?produto=${item.id}`;
  const productHref = `/lista/produto?produto=${item.id}`;
  const campaignHref = `/lista/rascunho?produto=${item.id}`;

  return (
    <div className="flex flex-wrap gap-ds-8">
      <Button asChild>
        <Link href={landingHref}>Abrir Landing Page</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={productHref}>Abrir Produto</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={campaignHref}>Criar Campanha</Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setDraft(item.notes);
          setNoteOpen(true);
        }}
      >
        Editar Nota
      </Button>
      <Button type="button" variant="secondary" onClick={() => setRemoveOpen(true)}>
        Remover
      </Button>
      <Modal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remover da fila"
        description="O Product sai desta fila de exemplo. Nada é apagado fora desta página."
        primaryLabel="Remover"
        onPrimary={() => {
          watchlist.remove(item.id);
          toast.push({ message: "Product removido da fila de exemplo.", tone: "success" });
        }}
      />
      <Modal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Nota"
        description="A nota fica só neste exemplo."
        primaryLabel="Guardar nota"
        onPrimary={() => {
          watchlist.updateNotes(item.id, draft);
          toast.push({ message: "Nota de exemplo atualizada. Nada foi gravado.", tone: "success" });
        }}
      >
        <Label htmlFor={`nota-${item.id}`}>Nota</Label>
        <Textarea id={`nota-${item.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </Modal>
    </div>
  );
}
