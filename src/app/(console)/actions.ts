"use server";

import { revalidatePath } from "next/cache";
import { operatorSearchMessage, runConsoleSearch, validatePausedDraft } from "@/lib/console/gateway";
import { consoleStore } from "@/lib/console/store";
import type { WatchPriority, WatchStatus } from "@/lib/console/types";

function refresh() {
  for (const path of ["/dashboard", "/pesquisa", "/pesquisa/resultado", "/lista", "/produtos", "/oportunidades", "/campanhas", "/relatorios"]) {
    revalidatePath(path);
  }
}

export async function runMarketSearch(input: { keyword: string; country: string; language: string; device: string; maxPages: number }) {
  const { record, pages } = await runConsoleSearch(input);
  const store = consoleStore();
  store.saveSearch(record);
  for (const page of pages) store.savePage(record.id, page.id, page.html);
  refresh();
  return {
    id: record.id,
    status: record.status,
    message: record.status === "REJECTED" && record.products.length === 0 && record.organicCount === 0
      ? operatorSearchMessage(record.issues)
      : "Pesquisa concluída",
  };
}

export async function addToWatchlist(searchId: string, productId: string) {
  const store = consoleStore();
  const search = store.getSearch(searchId);
  const product = search?.products.find((item) => item.id === productId);
  if (!search || !product) return { status: "unknown" as const };
  const items = store.readWatchlist();
  const id = `${searchId}-${productId}`;
  if (items.some((item) => item.id === id)) return { status: "present" as const };
  const now = new Date().toISOString();
  items.unshift({
    id,
    searchId,
    productId,
    name: product.name,
    brand: product.brand,
    priceLabel: product.priceLabel,
    keyword: search.keyword,
    country: search.country,
    domain: product.domain,
    landingPageId: product.landingPageId,
    status: "analise",
    priority: "medium",
    notes: "",
    addedOn: now,
    events: [{ at: now, label: "Entrou na fila" }],
  });
  store.writeWatchlist(items);
  refresh();
  return { status: "added" as const, name: product.name };
}

export async function updateWatchNote(id: string, notes: string) {
  const store = consoleStore();
  const now = new Date().toISOString();
  store.writeWatchlist(store.readWatchlist().map((item) => item.id === id
    ? { ...item, notes, events: [...item.events, { at: now, label: "Nota atualizada" }] }
    : item));
  refresh();
}

export async function updateWatchStatus(id: string, status: WatchStatus) {
  const store = consoleStore();
  const now = new Date().toISOString();
  store.writeWatchlist(store.readWatchlist().map((item) => item.id === id
    ? { ...item, status, events: [...item.events, { at: now, label: "Estado atualizado" }] }
    : item));
  refresh();
}

export async function updateWatchPriority(id: string, priority: WatchPriority) {
  const store = consoleStore();
  const now = new Date().toISOString();
  store.writeWatchlist(store.readWatchlist().map((item) => item.id === id
    ? { ...item, priority, events: [...item.events, { at: now, label: "Prioridade atualizada" }] }
    : item));
  refresh();
}

export async function removeFromWatchlist(id: string) {
  const store = consoleStore();
  store.writeWatchlist(store.readWatchlist().filter((item) => item.id !== id));
  refresh();
}

export async function createCampaignDraft(searchId: string, productId: string) {
  const store = consoleStore();
  const search = store.getSearch(searchId);
  const product = search?.products.find((item) => item.id === productId);
  if (!search || !product) return { status: "unknown" as const };
  const checked = validatePausedDraft(product.name);
  const draft = {
    id: `draft-${searchId}-${productId}`,
    searchId,
    productId,
    name: product.name,
    keyword: search.keyword,
    status: "PAUSED" as const,
    googleAds: checked.googleAds,
    sent: false as const,
    issues: checked.issues,
    createdAt: new Date().toISOString(),
  };
  const drafts = store.readDrafts().filter((item) => item.id !== draft.id);
  drafts.unshift(draft);
  store.writeDrafts(drafts);
  refresh();
  return { status: "created" as const, id: draft.id, googleAds: draft.googleAds };
}
