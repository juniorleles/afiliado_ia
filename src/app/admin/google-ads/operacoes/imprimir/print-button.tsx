"use client";

export function PrintButton() {
  return (
    <button className="w-fit rounded-ds-sm border border-input px-ds-12 py-ds-8 text-body print:hidden" type="button" onClick={() => window.print()}>
      Exportar PDF
    </button>
  );
}
