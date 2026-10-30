import { presentVisitorCopy } from "@/lib/presell-quality/premium-slots";
import type { SellerStatedPackage } from "@/lib/presell-quality/commercial-reuse";
import type { VisualComposition } from "./types.ts";

export function presentCommercialHeroCopy(text: string): string {
  const grounded = presentVisitorCopy(text);
  return grounded.replace(
    /^According to the seller, the declared composition includes\s+/i,
    "Includes ",
  );
}

export function presentPackageShipping(term: string): string {
  const stripped = term.replace(/^Seller-stated\s+/i, "").replace(/\s+seller-stated\.?$/i, "").trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : term;
}

export function commercialPackageSummary(packages: SellerStatedPackage[]): string {
  if (!packages.length) return "";
  return packages.map((item) => `${item.quantity} at ${item.unitPrice} per bottle`).join("; ");
}

export function complianceLines(input: {
  attribution?: string | null;
  affiliate?: boolean;
}): string[] {
  const lines = [
    "Preview only. Commercial checkout is not enabled on this page.",
    input.attribution || "Package prices and totals come from the seller's order page. They are not independently verified and this is not a live checkout.",
  ];
  if (input.affiliate) {
    lines.push("This page is an informational presentation. I may earn a commission if you purchase through the seller.");
  }
  return lines;
}

export function heroIntroduction(text: string, composition: VisualComposition): string {
  return composition.copy.tone === "commercial" ? presentCommercialHeroCopy(text) : presentVisitorCopy(text);
}
