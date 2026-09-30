import type { VisualCharacter } from "@/lib/visual-identity/extract";

/** Serializable presentation tokens. Safe to pass from a server page into client trees. */
export type SourceVisual = {
  character: VisualCharacter;
  style: Record<string, string>;
};
