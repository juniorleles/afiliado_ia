import { mediaStorageKind } from "@/lib/env";
import { createLocalStorage, localMediaRoot } from "@/lib/storage/local";
import { createObjectStorage, type MediaStorage } from "@/lib/storage/object";

let cached: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  if (cached) return cached;
  cached = mediaStorageKind() === "OBJECT_STORAGE" ? createObjectStorage() : createLocalStorage();
  return cached;
}

export function resetMediaStorageForTests(): void {
  cached = undefined;
}

export { localMediaRoot };
export type { MediaStorage } from "@/lib/storage/object";
