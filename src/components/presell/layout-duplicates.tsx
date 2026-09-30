"use client";

import { useEffect } from "react";
import { LAYOUT_SELECTORS, type LayoutSectionId } from "@/lib/lp-builder/layout";

export function LayoutDuplicates({ copies }: { copies: Array<{ key: string; sectionId: LayoutSectionId }> }) {
  useEffect(() => {
    const made: HTMLElement[] = [];
    for (const copy of copies) {
      const source = document.querySelector(LAYOUT_SELECTORS[copy.sectionId]);
      const parent = source?.parentElement;
      if (!source || !parent) continue;
      const node = source.cloneNode(true) as HTMLElement;
      node.removeAttribute("id");
      node.dataset.layoutDuplicate = copy.key;
      parent.insertBefore(node, source.nextSibling);
      made.push(node);
    }
    return () => {
      for (const node of made) node.remove();
    };
  }, [copies]);
  return null;
}
