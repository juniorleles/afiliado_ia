/**
 * Parser de markdown restrito, de propósito — não é um parser de markdown
 * geral (não suporta negrito, link, tabela, etc.). Suporta só o subconjunto
 * combinado pra Fase 3: "## " vira seção (heading), "- " vira item de
 * lista, e qualquer outra linha não-vazia vira parágrafo.
 *
 * Escrito do zero, sem dependência nova, por 2 motivos: (1) não dá pra
 * `npm install` neste ambiente de geração pra confirmar que uma lib
 * externa instala limpo; (2) o subconjunto que a Fase 3 pediu é pequeno o
 * suficiente pra não precisar de um parser de markdown completo.
 *
 * Nunca produz HTML bruto — devolve dado estruturado, o componente que
 * renderiza decide o JSX. Isso evita risco de XSS (texto sempre passa pelo
 * escaping automático do React), importante desde já porque a Fase 6 vai
 * gravar texto gerado por IA nesse mesmo campo.
 */

export type MarkdownBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];

  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphBuffer.join(" ").trim() });
      paragraphBuffer = [];
    }
  }

  function flushList() {
    if (listBuffer.length > 0) {
      blocks.push({ type: "list", items: [...listBuffer] });
      listBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}
