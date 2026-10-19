import { setPresentationTemplateAction } from "@/app/admin/presentation-template-action";

export function PresentationTemplateForm({
  campaignId,
  selected,
}: {
  campaignId: number;
  selected: string | null | undefined;
}) {
  return (
    <form action={setPresentationTemplateAction} className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-200">
      <label htmlFor={`presentation-${campaignId}`}>Apresentação</label>
      <select
        id={`presentation-${campaignId}`}
        name="presentationTemplate"
        defaultValue={selected === "PRODUCT_SHOWCASE_PREMIUM_V1" ? selected : "LEGACY"}
        className="rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-zinc-100"
      >
        <option value="LEGACY">Renderer atual</option>
        <option value="PRODUCT_SHOWCASE_PREMIUM_V1">Product Showcase Premium V1</option>
      </select>
      <input type="hidden" name="campaignId" value={campaignId} />
      <button type="submit" className="rounded-md border border-zinc-500 px-2 py-1 text-zinc-100">
        Salvar apresentação
      </button>
    </form>
  );
}
