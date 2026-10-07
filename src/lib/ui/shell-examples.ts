import type { BadgeStatus } from "@/components/ui/badge";

export const exampleOffers: { name: string; status: BadgeStatus; note: string }[] = [
  { name: "North Offer", status: "pronto", note: "Exemplo de linha" },
  { name: "Plain Offer", status: "atencao", note: "Exemplo de linha" },
  { name: "Zebra Offer", status: "em-analise", note: "Exemplo de linha" },
];

export const exampleCampaigns: { name: string; status: BadgeStatus }[] = [
  { name: "Paused Test Draft", status: "revisar" },
  { name: "North Offer", status: "pronto" },
];

export const exampleReadiness: { label: string; status: BadgeStatus }[] = [
  { label: "Busca de mercado", status: "pronto" },
  { label: "Conta de anúncios", status: "atencao" },
  { label: "Publicação da presell", status: "em-analise" },
];
