// Roda com: node --experimental-strip-types scripts/test-markdown.ts
import { parseMarkdown } from "../src/lib/markdown.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const sample = `
## Benefits

- Keeps you warm down to -20C
- Machine washable
- Available in 4 colors

This jacket has been tested in real winter conditions.

## FAQ

- Does it run true to size? Yes, order your usual size.
- Is shipping included? Yes, for orders over $50.
`;

const blocks = parseMarkdown(sample);

assert(blocks.length === 5, `5 blocos no total (achei ${blocks.length})`);
assert(blocks[0].type === "heading" && blocks[0].text === "Benefits", "1º bloco é heading 'Benefits'");
assert(
  blocks[1].type === "list" && blocks[1].items.length === 3,
  "2º bloco é lista com 3 itens"
);
assert(
  blocks[2].type === "paragraph" && blocks[2].text.includes("real winter conditions"),
  "3º bloco é parágrafo com o texto certo"
);
assert(blocks[3].type === "heading" && blocks[3].text === "FAQ", "4º bloco é heading 'FAQ'");
assert(blocks[4].type === "list" && blocks[4].items.length === 2, "5º bloco é lista com 2 itens (FAQ)");

const noBlankLine = "## Benefits\n- Item one\n- Item two";
const blocks2 = parseMarkdown(noBlankLine);
assert(blocks2.length === 2, "heading + lista sem linha em branco entre eles ainda separa certo (2 blocos)");
assert(blocks2[0].type === "heading", "1º bloco continua heading mesmo sem linha em branco depois");

assert(parseMarkdown("").length === 0, "string vazia devolve array vazio, sem lançar erro");

const plain = parseMarkdown("Just a plain sentence with no markdown at all.");
assert(plain.length === 1 && plain[0].type === "paragraph", "texto simples vira 1 parágrafo");

const multiBlank = parseMarkdown("Para one.\n\n\n\nPara two.");
assert(multiBlank.length === 2, `múltiplas linhas em branco não geram bloco fantasma (achei ${multiBlank.length} blocos)`);

const htmlAsText = parseMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
assert(htmlAsText.length === 1 && htmlAsText[0].type === "paragraph", "HTML cru no body vira parágrafo, não bloco especial");
assert(
  htmlAsText[0].type === "paragraph" && htmlAsText[0].text.includes("<script>alert(1)</script>"),
  "tags HTML são texto, o parser não executa nem remove como se fosse HTML",
);

console.log("\nTodos os testes do parser de markdown passaram.");
