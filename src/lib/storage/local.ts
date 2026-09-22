import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MediaStorage, StoredObject } from "@/lib/storage/object";

export function localMediaRoot(): string {
  const override = process.env.PRESELL_OS_MEDIA?.trim();
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "product-images");
}

export function createLocalStorage(root = localMediaRoot()): MediaStorage {
  mkdirSync(root, { recursive: true });
  const resolve = (key: string) => {
    const dest = path.resolve(root, key);
    if (!dest.startsWith(path.resolve(root))) throw new Error("Invalid storage key.");
    return dest;
  };
  return {
    kind: "LOCAL",
    async put(key, body) {
      const dest = resolve(key);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, body);
    },
    async get(key): Promise<StoredObject | null> {
      const dest = resolve(key);
      if (!existsSync(dest)) return null;
      const ext = path.extname(dest).toLowerCase();
      const contentType =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
      return { key, body: readFileSync(dest), contentType };
    },
    async delete(key) {
      const dest = resolve(key);
      if (existsSync(dest)) unlinkSync(dest);
    },
    async exists(key) {
      return existsSync(resolve(key));
    },
  };
}
