"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createCampaignDraft, removeFromWatchlist, updateWatchNote, updateWatchPriority, updateWatchStatus } from "@/app/(console)/actions";
import type { WatchItem, WatchPriority, WatchStatus } from "@/lib/console/types";

const statuses = [
  { value: "pronto", label: "Pronto para anunciar" },
  { value: "analise", label: "Em análise" },
  { value: "revisao", label: "Aguardando revisão" },
  { value: "descartado", label: "Descartado" },
];

const priorities = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];

export function WatchlistActions({ item }: { item: WatchItem }) {
  const toast = useToast();
  const router = useRouter();
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(item.notes);

  return (
    <div className="flex flex-col gap-ds-12">
      <div className="flex flex-wrap gap-ds-8">
        <Button asChild>
          <Link href={`/lista/landing-page?id=${encodeURIComponent(item.id)}`}>Abrir Landing Page</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/lista/produto?id=${encodeURIComponent(item.id)}`}>Abrir Produto</Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void createCampaignDraft(item.searchId, item.productId).then((result) => {
              if (result.status !== "created") return;
              toast.push({ message: result.googleAds === "Connected" ? "Rascunho pausado. Nenhum anúncio é enviado." : "Not Connected. Nenhum anúncio é enviado.", tone: "success" });
              router.push(`/lista/rascunho?id=${encodeURIComponent(result.id)}`);
            });
          }}
        >
          Criar Campanha
        </Button>
        <Button type="button" variant="secondary" onClick={() => { setDraft(item.notes); setNoteOpen(true); }}>Editar Nota</Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void removeFromWatchlist(item.id).then(() => {
              toast.push({ message: "Product removido da fila.", tone: "success" });
              router.refresh();
            });
          }}
        >
          Remover
        </Button>
      </div>
      <div className="grid gap-ds-12 sm:grid-cols-2">
        <Select id={`status-${item.id}`} label="Estado" value={item.status} onValueChange={(value) => void updateWatchStatus(item.id, value as WatchStatus).then(() => router.refresh())} options={statuses} />
        <Select id={`priority-${item.id}`} label="Prioridade" value={item.priority} onValueChange={(value) => void updateWatchPriority(item.id, value as WatchPriority).then(() => router.refresh())} options={priorities} />
      </div>
      <Modal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Nota"
        description="A nota fica gravada nesta fila."
        primaryLabel="Guardar nota"
        onPrimary={() => {
          void updateWatchNote(item.id, draft).then(() => {
            toast.push({ message: "Nota atualizada.", tone: "success" });
            router.refresh();
          });
        }}
      >
        <Label htmlFor={`nota-${item.id}`}>Nota</Label>
        <Textarea id={`nota-${item.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </Modal>
    </div>
  );
}
