import type { PresellSection } from "@/lib/presell-page";
import { chunkBullets, chunkParagraphs, type DisplayChunk } from "@/lib/presell-display";
import { FAQAccordion } from "@/components/presell/faq-accordion";

function ChunkGrid({ chunks, dense }: { chunks: DisplayChunk[]; dense?: boolean }) {
  if (chunks.length === 0) return null;
  const many = chunks.length > 1 || Boolean(dense);
  return (
    <ul className={many ? "mt-4 grid gap-3 sm:grid-cols-2" : "mt-4 grid gap-3"}>
      {chunks.map((chunk) => (
        <li
          key={`${chunk.title ?? ""}:${chunk.body.slice(0, 80)}`}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
        >
          {chunk.title ? <p className="font-medium text-zinc-100">{chunk.title}</p> : null}
          <p className={`text-sm leading-relaxed text-zinc-300 ${chunk.title ? "mt-1 text-zinc-400" : ""}`}>{chunk.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function ContentSection({ section }: { section: PresellSection }) {
  if (section.id === "faq") return <FAQAccordion items={section.faq} />;

  if (section.id === "ingredients" && section.cards.length > 0) {
    return (
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {section.cards.map((card) => (
          <li key={card.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="font-medium text-zinc-100">{card.title}</p>
            {card.body ? <p className="mt-1 text-sm text-zinc-400">{card.body}</p> : null}
          </li>
        ))}
      </ul>
    );
  }

  if (section.id === "features" && section.bullets.length > 0) {
    return <ChunkGrid chunks={section.bullets.map((body) => ({ body }))} dense />;
  }

  if (section.id === "usage") {
    return (
      <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-4 py-4">
        {chunkParagraphs(section.paragraphs).map((chunk) => (
          <p key={chunk.body} className="text-sm leading-relaxed text-zinc-300">
            {chunk.body}
          </p>
        ))}
        {section.bullets.length > 0 ? (
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ol>
        ) : null}
      </div>
    );
  }

  if (section.id === "guarantee") {
    return (
      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4">
        {section.paragraphs.map((p) => (
          <p key={p} className="text-sm leading-relaxed text-zinc-200">
            {p}
          </p>
        ))}
      </div>
    );
  }

  const paraChunks = chunkParagraphs(section.paragraphs);
  const bulletChunks = chunkBullets(section.bullets);
  const useCards = section.id === "overview" || section.id === "considerations" || paraChunks.length + bulletChunks.length > 2;

  if (useCards) {
    return (
      <div>
        <ChunkGrid chunks={paraChunks} dense={section.id === "overview" || section.id === "considerations"} />
        {bulletChunks.length > 0 ? <ChunkGrid chunks={bulletChunks} dense /> : null}
      </div>
    );
  }

  return (
    <div>
      {paraChunks.map((chunk) => (
        <p key={chunk.body} className="mt-3 leading-relaxed text-zinc-300">
          {chunk.title ? <span className="font-medium text-zinc-100">{chunk.title}: </span> : null}
          {chunk.body}
        </p>
      ))}
      {bulletChunks.length > 0 ? <ChunkGrid chunks={bulletChunks} /> : null}
    </div>
  );
}
