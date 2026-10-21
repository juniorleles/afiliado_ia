import type { ConversionBrief } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";
import { validateSalesCopy } from "@/lib/page-blueprint/validate";

/**
 * Optional editorial adapter. The default is offline and returns null.
 * A future paid-model adapter may rewrite the introduction using only contract
 * sentences. Invalid patches are discarded. Tests never call a paid API.
 */
export type CopyIntelPatch = {
  introduction?: string;
};

export type CopyAdapter = (copy: SalesCopy, contract: ProductContract, brief: ConversionBrief) => CopyIntelPatch | null;

export function offlineCopyAdapter(): CopyAdapter {
  return () => null;
}

export function applyCopyIntelligence(
  copy: SalesCopy,
  contract: ProductContract,
  brief: ConversionBrief,
  adapter: CopyAdapter = offlineCopyAdapter(),
): SalesCopy {
  const patch = adapter(copy, contract, brief);
  if (!patch?.introduction) return copy;
  const next: SalesCopy = {
    ...copy,
    producer: "EDITORIAL_ADAPTER",
    introduction: { ...copy.introduction, text: patch.introduction, producer: "EDITORIAL_ADAPTER" },
  };
  return validateSalesCopy(next, contract, brief).ok ? next : copy;
}
