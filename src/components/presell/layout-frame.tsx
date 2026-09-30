import type { ReactNode } from "react";
import { LayoutDuplicates } from "@/components/presell/layout-duplicates";
import { buildGeneratedLayout, layoutStyle, resolveLayout, type LayoutAssignment } from "@/lib/lp-builder/layout";
import { listLayoutOverrides } from "@/lib/lp-builder/layout-store";

export function LayoutFrame({ campaignId, children }: { campaignId: number; children: ReactNode }) {
  const rows = listLayoutOverrides(campaignId);
  if (rows.length === 0) return children;
  const assignments: LayoutAssignment[] = rows.map((row) => ({
    sectionKey: row.sectionKey,
    sectionId: row.sectionId,
    visible: row.visible,
    collapsed: row.collapsed,
    order: row.order,
    priority: row.priority,
    pinned: row.pinned,
    locked: row.locked,
    futureCompatible: row.futureCompatible,
    duplicate: row.duplicate,
  }));
  const resolved = resolveLayout({ generated: buildGeneratedLayout(), assignments });
  const css = layoutStyle(resolved);
  const copies = resolved.sections.filter((section) => section.duplicate).map((section) => ({ key: section.id, sectionId: section.sectionId }));
  if (!css && copies.length === 0) return children;
  return (
    <div className="lp-layout">
      {css ? <style>{css}</style> : null}
      <LayoutDuplicates copies={copies} />
      {children}
    </div>
  );
}
