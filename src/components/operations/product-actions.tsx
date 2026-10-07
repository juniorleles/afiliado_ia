"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addToWatchlist, createCampaignDraft } from "@/app/(console)/actions";

export function ProductQuickActions({ searchId, productId, saved }: { searchId: string; productId: string; saved: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const details = `/pesquisa/resultado/detalhe?busca=${encodeURIComponent(searchId)}&produto=${encodeURIComponent(productId)}`;
  const landing = `/pesquisa/resultado/landing-page?busca=${encodeURIComponent(searchId)}&produto=${encodeURIComponent(productId)}`;

  return (
    <div className="flex flex-wrap gap-ds-8">
      <Button asChild>
        <Link href={landing}>Abrir Landing Page</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={details}>Ver detalhes</Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void createCampaignDraft(searchId, productId)
            .then((result) => {
              if (result.status !== "created") {
                toast.push({ message: "Este Product não está nesta busca.", tone: "warning" });
                return;
              }
              toast.push({
                message: result.googleAds === "Connected" ? "Rascunho pausado. Nenhum anúncio é enviado." : "Not Connected. Nenhum anúncio é enviado.",
                tone: "success",
              });
              router.push(`/lista/rascunho?id=${encodeURIComponent(result.id)}`);
            })
            .catch(() => toast.push({ message: "Não foi possível criar o rascunho.", tone: "danger" }))
            .finally(() => setPending(false));
        }}
      >
        Gerar rascunho
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending || saved}
        onClick={() => {
          setPending(true);
          void addToWatchlist(searchId, productId)
            .then((result) => {
              toast.push({
                message: result.status === "added" ? "Product salvo na fila." : "Este Product já está na fila.",
                tone: "success",
              });
              router.refresh();
            })
            .catch(() => toast.push({ message: "Não foi possível salvar na fila.", tone: "danger" }))
            .finally(() => setPending(false));
        }}
      >
        {saved ? "Na fila" : "Salvar na lista"}
      </Button>
    </div>
  );
}
