"use client";

export default function RealAssetsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="ds-index" data-lab-error="real-assets">
      <h1>Não foi possível concluir esta ação</h1>
      <p>Tente novamente. A aprovação não é gravada se o arquivo não puder ser salvo.</p>
      <button className="ds-btn" type="button" onClick={() => reset()}>
        Voltar à galeria
      </button>
    </main>
  );
}
