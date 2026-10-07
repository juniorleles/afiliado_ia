"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { watchlistCatalog, watchlistSeed, type WatchlistItem } from "@/lib/ui/watchlist";

type AddResult = "added" | "present" | "unknown";

type WatchlistContextValue = {
  items: WatchlistItem[];
  has: (id: string) => boolean;
  find: (id?: string) => WatchlistItem;
  add: (id: string) => AddResult;
  quickAdd: () => WatchlistItem | null;
  remove: (id: string) => void;
  updateNotes: (id: string, notes: string) => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(watchlistSeed);

  function has(id: string) {
    return items.some((item) => item.id === id);
  }

  function find(id?: string) {
    return items.find((item) => item.id === id) ?? watchlistCatalog.find((item) => item.id === id) ?? watchlistCatalog[0];
  }

  function add(id: string): AddResult {
    const source = watchlistCatalog.find((item) => item.id === id);
    if (!source) return "unknown";
    if (items.some((item) => item.id === id)) return "present";
    setItems((current) => (current.some((item) => item.id === id) ? current : [source, ...current]));
    return "added";
  }

  function quickAdd() {
    const next = watchlistCatalog.find((item) => !items.some((current) => current.id === item.id));
    if (!next) return null;
    setItems((current) => (current.some((item) => item.id === next.id) ? current : [next, ...current]));
    return next;
  }

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function updateNotes(id: string, notes: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, notes } : item)));
  }

  return (
    <WatchlistContext.Provider value={{ items, has, find, add, quickAdd, remove, updateNotes }}>{children}</WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error("useWatchlist must be used within WatchlistProvider");
  return context;
}
