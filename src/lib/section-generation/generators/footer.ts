import { footerPrompt } from "@/lib/section-generation/prompts/footer";
import { failed, generated } from "@/lib/section-generation/support";

export type FooterInput = {
  productName: string;
  marketConfidence: number | null;
};

export function generateFooter(input: FooterInput) {
  if (!input.productName.trim()) return failed("footer", ["O nome do produto não está nos fatos."], [`Prompt ${footerPrompt.id} não gerou o rodapé.`]);
  const productName = input.productName.trim();
  return generated("footer", { productName }, [{ origin: "ProductFacts", field: "productName", text: productName }], [`Prompt ${footerPrompt.id}: ${footerPrompt.objective}`], [], input.marketConfidence, {
    prose: productName,
    slotsFilled: 1,
    slots: 1,
  });
}
