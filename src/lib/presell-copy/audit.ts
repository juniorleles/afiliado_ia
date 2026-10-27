import { auditBlockedClaim } from "@/lib/presell-copy/policy";
import type { ClaimAuditRow, SellerStatementClass } from "@/lib/presell-copy/types";

export function auditSellerStatements(
  rows: Array<{ id: string; text: string; field: string; blockReason?: string; sourceUrl?: string | null }>,
): ClaimAuditRow[] {
  return rows.map((row) =>
    auditBlockedClaim({
      id: row.id,
      text: row.text,
      field: row.field,
      blockReason: row.blockReason ?? "Blocked by the 54B evidence registry.",
      sourceUrl: row.sourceUrl,
    }),
  );
}

export function classifyEvidenceInventory(rows: ClaimAuditRow[]): Record<SellerStatementClass, number> {
  const counts: Record<SellerStatementClass, number> = {
    VERIFIED_PRODUCT_FACT: 0,
    SELLER_STATED_ALLOWED: 0,
    SELLER_STATED_RESTRICTED: 0,
    UNVERIFIED: 0,
    CONFLICTING: 0,
    PROHIBITED: 0,
  };
  for (const row of rows) counts[row.class] += 1;
  return counts;
}
