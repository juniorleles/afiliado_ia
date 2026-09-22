import { GenerateClient } from "./generate-client";

export const maxDuration = 60;

export default function GeneratePage() {
  return (
    <div data-preview-wide>
      <h2 className="mb-1 text-xl font-medium">Presell Content Engine V2</h2>
      <p className="mb-8 text-sm text-zinc-400">
        Import or enter product facts. The system researches current market
        evidence and recommends a first presell strategy. Generation never
        publishes. AI copy is not evidence.
      </p>
      <GenerateClient />
    </div>
  );
}
