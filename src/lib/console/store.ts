import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CampaignDraftRecord, ConsoleSearchRecord, WatchItem } from "./types";

const SAFE = /^[a-z0-9-]+$/;

export type ConsoleStore = ReturnType<typeof createConsoleStore>;

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function createConsoleStore(root = join(process.cwd(), "data", "console")) {
  const searches = join(root, "searches");
  const pages = join(root, "pages");
  mkdirSync(searches, { recursive: true });
  mkdirSync(pages, { recursive: true });

  function searchFile(id: string): string | null {
    return SAFE.test(id) ? join(searches, `${id}.json`) : null;
  }

  return {
    root,
    saveSearch(record: ConsoleSearchRecord) {
      const file = searchFile(record.id);
      if (file === null) return;
      writeFileSync(file, JSON.stringify(record));
    },
    getSearch(id: string): ConsoleSearchRecord | null {
      const file = searchFile(id);
      if (file === null || !existsSync(file)) return null;
      return readJson<ConsoleSearchRecord | null>(file, null);
    },
    listSearches(): ConsoleSearchRecord[] {
      return readdirSync(searches)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson<ConsoleSearchRecord | null>(join(searches, name), null))
        .filter((item): item is ConsoleSearchRecord => item !== null && typeof item.createdAt === "string")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    savePage(searchId: string, pageId: string, html: string) {
      if (!SAFE.test(searchId) || !SAFE.test(pageId)) return;
      const dir = join(pages, searchId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${pageId}.html`), html);
    },
    readPage(searchId: string, pageId: string): string | null {
      if (!SAFE.test(searchId) || !SAFE.test(pageId)) return null;
      const file = join(pages, searchId, `${pageId}.html`);
      if (!existsSync(file)) return null;
      return readFileSync(file, "utf8");
    },
    readWatchlist(): WatchItem[] {
      const items = readJson<WatchItem[]>(join(root, "watchlist.json"), []);
      return Array.isArray(items) ? items : [];
    },
    writeWatchlist(items: WatchItem[]) {
      writeFileSync(join(root, "watchlist.json"), JSON.stringify(items));
    },
    readDrafts(): CampaignDraftRecord[] {
      const items = readJson<CampaignDraftRecord[]>(join(root, "drafts.json"), []);
      return Array.isArray(items) ? items : [];
    },
    writeDrafts(items: CampaignDraftRecord[]) {
      writeFileSync(join(root, "drafts.json"), JSON.stringify(items));
    },
  };
}

let shared: ConsoleStore | null = null;

export function consoleStore(): ConsoleStore {
  shared ??= createConsoleStore();
  return shared;
}
