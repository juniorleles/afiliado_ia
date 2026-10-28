import { primaryOperationalTheme } from "@/lib/presell-quality/operational-theme";
import { reviewGroupOf, type ReviewGroupId } from "@/lib/presell-quality/review-labels";

export type ReviewPresentation = {
  candidateId: string;
  version: number;
  theme: string;
  group: ReviewGroupId;
  title: string;
  found: string;
  source: string;
  attention: string[];
  preview: string;
  previewVersion: string;
  translationSafe: boolean;
  unsafeReason: string | null;
  original: string;
};

type Template = {
  id: string;
  test: (text: string) => boolean;
  title: string;
  found: (text: string) => string;
  attention: string[];
  preview: (text: string) => string;
};

const TEMPLATES: Template[] = [
  {
    id: "processing-1-2",
    test: (text) => /1-2 business days processing time/i.test(text) && /holiday/i.test(text),
    title: "Prazo de preparação do pedido",
    found: () => "O vendedor informa que precisa de 1 a 2 dias úteis para preparar o pedido antes do envio. Durante feriados, podem ocorrer atrasos.",
    attention: ["Esse prazo é para preparar o pedido, não para entregar o produto ao comprador."],
    preview: () => "Segundo o vendedor, os pedidos normalmente levam de 1 a 2 dias úteis para serem preparados antes do envio. Em feriados, esse prazo pode aumentar.",
  },
  {
    id: "invalid-address-3-5",
    test: (text) => /invalid information/i.test(text) && /3-5 business days/i.test(text),
    title: "Atraso se o endereço ou o pagamento estiver incompleto",
    found: () => "O vendedor informa que não consegue processar o pedido quando o pagamento ou o endereço está incompleto ou incorreto. Nesse caso, a preparação pode atrasar mais 3 a 5 dias úteis.",
    attention: ["O atraso extra só se aplica quando os dados do pedido estão inválidos."],
    preview: () => "Segundo o vendedor, se o endereço ou o pagamento estiver incompleto ou incorreto, o processamento pode atrasar mais 3 a 5 dias úteis e o pedido pode não ser preparado.",
  },
  {
    id: "usps-not-responsible",
    test: (text) => /not responsible/i.test(text) && /usps/i.test(text),
    title: "O vendedor não garante o prazo do correio",
    found: () => "O vendedor informa que não se responsabiliza se o pacote não chegar no prazo anunciado pelo correio. Ele também diz que leva de 1 a 2 dias úteis só para preparar o pedido.",
    attention: ["Isso não é uma promessa de entrega. O prazo do correio não é assumido pelo vendedor."],
    preview: () => "Segundo o vendedor, ele não se responsabiliza se o pacote não chegar no prazo do correio. O pedido ainda leva de 1 a 2 dias úteis para ser preparado.",
  },
  {
    id: "customs",
    test: (text) => /customs clearance/i.test(text),
    title: "Atrasos na alfândega",
    found: () => "O vendedor informa que não se responsabiliza por atrasos causados pela alfândega do país de destino.",
    attention: ["Essa condição vale para destinos que passam por alfândega. Não é uma promessa de prazo."],
    preview: () => "Segundo o vendedor, atrasos causados pela alfândega do país de destino não são de responsabilidade dele.",
  },
  {
    id: "cancel-24h",
    test: (text) => /24 hours/i.test(text) && /cancel/i.test(text),
    title: "Cancelamento em até 24 horas",
    found: () => "O vendedor informa que o pedido vai direto para o centro de envio. O cancelamento só é possível em até 24 horas após a compra. Depois disso, o pedido não pode ser cancelado. Se já tiver sido enviado, o cliente precisa recusar ou devolver o pacote com código de rastreio para pedir reembolso.",
    attention: ["A janela de cancelamento é de 24 horas. Depois disso, o caminho é recusa ou devolução."],
    preview: () => "Segundo o vendedor, o cliente pode cancelar em até 24 horas após a compra. Depois desse prazo, o pedido não pode ser cancelado. Se já tiver sido enviado, é preciso recusar ou devolver o pacote com código de rastreio para solicitar o reembolso.",
  },
  {
    id: "no-refund-if-delivered",
    test: (text) => /does not offer refunds/i.test(text) && /delivery was made/i.test(text),
    title: "Sem reembolso se a entrega constar como feita",
    found: () => "O vendedor informa que não oferece reembolso quando o rastreio mostra que a entrega foi feita no endereço. Se o item não chegou, ele pede para o cliente falar com o correio.",
    attention: ["O vendedor não assume a perda depois que o rastreio marca a entrega."],
    preview: () => "Segundo o vendedor, não há reembolso quando o rastreio indica que a entrega foi feita no endereço. Se o item não chegou, o cliente deve procurar o correio.",
  },
  {
    id: "sixty-day-fulfillment",
    test: (text) => /sixty \(60\) days/i.test(text) && /fulfillment facility/i.test(text),
    title: "Devolução em até 60 dias, com frete pago pelo comprador",
    found: () => "O vendedor informa que o produto precisa chegar ao centro de envio em até 60 dias após a compra para o reembolso integral. É preciso devolver todos os frascos e pagar o frete de volta. O valor pode levar de 3 a 5 dias úteis para aparecer no banco.",
    attention: ["O prazo de 60 dias é para o produto chegar ao centro de envio. O comprador paga o frete de devolução."],
    preview: () => "Segundo o vendedor, para o reembolso integral o produto precisa chegar ao centro de envio em até 60 dias após a compra, com todos os frascos. O comprador paga o frete de devolução, e o valor pode levar de 3 a 5 dias úteis para aparecer no banco.",
  },
  {
    id: "return-tracking",
    test: (text) => /tracking number for your return/i.test(text),
    title: "Código de rastreio na devolução",
    found: () => "O vendedor informa que é obrigatório enviar o código de rastreio da devolução. Sem esse código, a análise pode atrasar.",
    attention: ["Sem o código de rastreio, a devolução pode não ser analisada no prazo."],
    preview: () => "Segundo o vendedor, a devolução precisa incluir um código de rastreio. Sem esse código, a análise pode atrasar.",
  },
  {
    id: "rma-60",
    test: (text) => /return authorization must be requested/i.test(text) && /60 days/i.test(text),
    title: "Autorização de devolução em até 60 dias",
    found: () => "O vendedor informa que a autorização de devolução precisa ser pedida e aprovada em até 60 dias após a data da compra.",
    attention: ["Sem essa autorização no prazo de 60 dias, a devolução pode ser recusada."],
    preview: () => "Segundo o vendedor, a autorização de devolução deve ser pedida e aprovada em até 60 dias após a compra.",
  },
  {
    id: "rma-email-tracking",
    test: (text) => /return authorization number must be included/i.test(text) && /rma/i.test(text),
    title: "Como devolver com o código de autorização",
    found: () => "O vendedor informa que o código de autorização precisa ir junto com o produto. Depois de receber o código, o cliente devolve o item, envia o código e o rastreio por e-mail e paga o frete.",
    attention: ["O comprador paga o envio de volta. O e-mail citado é só para acompanhar a devolução, não um canal geral de atendimento."],
    preview: () => "Segundo o vendedor, a devolução precisa incluir o código de autorização. Depois de receber esse código, o cliente envia o produto, informa o código e o rastreio por e-mail e paga o frete de volta.",
  },
  {
    id: "14-days-rma",
    test: (text) => /14 days of receipt of rma/i.test(text),
    title: "14 dias após a autorização para devolver",
    found: () => "O vendedor informa que o produto precisa ser enviado ao endereço indicado, por conta do comprador, em até 14 dias após o recebimento da autorização.",
    attention: ["O prazo de 14 dias começa depois da autorização, não depois da compra."],
    preview: () => "Segundo o vendedor, o produto deve ser enviado ao endereço indicado, por conta do comprador, em até 14 dias após o recebimento da autorização de devolução.",
  },
  {
    id: "good-condition",
    test: (text) => /good physical condition/i.test(text),
    title: "Produto precisa estar em bom estado",
    found: () => "O vendedor informa que o produto devolvido precisa estar em bom estado físico, sem quebra ou dano, e com todos os acessórios da compra.",
    attention: ["Produto danificado ou incompleto pode impedir o reembolso."],
    preview: () => "Segundo o vendedor, o produto devolvido precisa estar em bom estado físico, sem quebra ou dano, e com todos os acessórios da compra.",
  },
  {
    id: "return-address",
    test: (text) => /return address/i.test(text) && /aurora/i.test(text),
    title: "Endereço para devolução",
    found: () => "O vendedor informa o endereço de devolução: 19655 E 35th Dr #100, Aurora CO 80011, USA.",
    attention: ["Este é o endereço para devolver o produto, não um telefone ou e-mail de atendimento."],
    preview: () => "Segundo o vendedor, o endereço para devolução é 19655 E 35th Dr #100, Aurora CO 80011, USA.",
  },
  {
    id: "receipt",
    test: (text) => /receipt or proof of purchase/i.test(text),
    title: "Comprovante de compra",
    found: () => "O vendedor informa que a devolução só é concluída com recibo ou comprovante de compra.",
    attention: ["Sem comprovante, a devolução pode ser recusada."],
    preview: () => "Segundo o vendedor, a devolução exige recibo ou comprovante de compra.",
  },
  {
    id: "not-manufacturer",
    test: (text) => /do not send your purchase back to the manufacturer/i.test(text),
    title: "Não enviar ao fabricante",
    found: () => "O vendedor pede para não enviar a compra de volta ao fabricante.",
    attention: ["Enviar ao fabricante pode impedir o reembolso pelo vendedor."],
    preview: () => "Segundo o vendedor, a compra não deve ser enviada de volta ao fabricante.",
  },
  {
    id: "inspect-email",
    test: (text) => /once your return is received and inspected/i.test(text),
    title: "Aviso depois da inspeção",
    found: () => "O vendedor informa que, depois de receber e inspecionar a devolução, envia um e-mail avisando se o reembolso foi aprovado ou recusado.",
    attention: ["O reembolso não é automático. Ele depende da inspeção."],
    preview: () => "Segundo o vendedor, depois de receber e inspecionar a devolução, ele envia um e-mail informando se o reembolso foi aprovado ou recusado.",
  },
  {
    id: "original-payment",
    test: (text) => /original method of payment/i.test(text) || /credit will automatically be applied/i.test(text),
    title: "Reembolso no mesmo pagamento",
    found: () => "O vendedor informa que, se o reembolso for aprovado, o valor volta para o cartão ou para a forma de pagamento original, em alguns dias.",
    attention: ["O prazo exato em dias não foi informado. O valor só volta depois da aprovação."],
    preview: () => "Segundo o vendedor, se o reembolso for aprovado, o valor volta para o cartão ou para a forma de pagamento original em alguns dias.",
  },
  {
    id: "check-bank",
    test: (text) => /haven.?t received a refund yet/i.test(text) && /credit card company/i.test(text),
    title: "Se o reembolso ainda não apareceu",
    found: () => "O vendedor pede para o cliente conferir de novo a conta e, se necessário, falar com a administradora do cartão, porque o reembolso pode demorar a aparecer.",
    attention: ["Isso não define um prazo novo de reembolso."],
    preview: () => "Segundo o vendedor, se o reembolso ainda não apareceu, o cliente deve conferir a conta e, se preciso, falar com a administradora do cartão, porque o lançamento pode demorar.",
  },
  {
    id: "contact-bank-email",
    test: (text) => /next contact your bank/i.test(text),
    title: "Se ainda não recebeu o reembolso",
    found: () => "O vendedor pede para o cliente falar com o banco, porque o reembolso pode levar um tempo para ser lançado. O endereço de e-mail da página está oculto pelo site.",
    attention: ["Não há um e-mail utilizável nesta página. Não inventamos um canal de contato."],
    preview: () => "Segundo o vendedor, se o reembolso ainda não apareceu depois de conferir a conta e o cartão, o cliente deve falar com o banco, porque o lançamento pode levar um tempo.",
  },
  {
    id: "processed-24h",
    test: (text) => /processed within 24 hours/i.test(text),
    title: "Preparação em até 24 horas",
    found: () => "O vendedor informa que os pedidos são processados em até 24 horas após a confirmação do pagamento.",
    attention: ["Esse prazo é de preparação, não de entrega."],
    preview: () => "Segundo o vendedor, os pedidos são processados em até 24 horas após a confirmação do pagamento.",
  },
  {
    id: "us-5-7-days",
    test: (text) => /united states/i.test(text) && /5\s*-\s*7 working days/i.test(text),
    title: "Prazo de envio informado para os Estados Unidos",
    found: () => "O vendedor informa envio gratuito para os Estados Unidos, com prazo de 5 a 7 dias úteis.",
    attention: ["Esse prazo foi informado só para os Estados Unidos. Não generalizamos para outros países."],
    preview: () => "Segundo o vendedor, o envio para os Estados Unidos é gratuito e costuma levar de 5 a 7 dias úteis.",
  },
  {
    id: "droppers-under-tongue",
    test: (text) => /two full droppers/i.test(text) && /under your tongue/i.test(text) && /30 seconds/i.test(text),
    title: "Como utilizar o produto",
    found: () => "O vendedor informa o uso de dois conta-gotas completos debaixo da língua, de manhã, antes do café da manhã, mantendo por 30 segundos. Se o gosto for forte, os dois conta-gotas podem ser dissolvidos em um copo d'água.",
    attention: [
      "Isso é uma instrução de uso declarada pelo vendedor, não uma comprovação de resultado.",
      "A frase promocional sobre resultados não entra na prévia.",
    ],
    preview: () => "Segundo o vendedor, o produto deve ser usado com dois conta-gotas completos debaixo da língua de manhã, antes do café da manhã, mantendo por 30 segundos antes de engolir. Se o gosto for forte, os dois conta-gotas podem ser dissolvidos em um copo d'água.",
  },
  {
    id: "ship-24h-5-10",
    test: (text) => /24 working hours/i.test(text) && /5 to 10 days/i.test(text) && /domestic orders/i.test(text),
    title: "Prazo estimado de entrega",
    found: () => "O vendedor informa que tenta enviar o pedido em até 24 horas úteis e que, em média, a encomenda chega entre 5 e 10 dias para pedidos domésticos, com transportadora como FedEx ou UPS.",
    attention: [
      "O prazo de 5 a 10 dias vale para pedidos domésticos, nas condições informadas pelo vendedor.",
      "Isso não é uma garantia de entrega.",
    ],
    preview: () => "Segundo a página comercial, a entrega é estimada entre 5 e 10 dias, nas condições informadas pelo vendedor. O envio é tentado em até 24 horas úteis, com transportadora como FedEx ou UPS.",
  },
  {
    id: "one-time-payment-ssl",
    test: (text) => /one time payment/i.test(text) && /ssl/i.test(text),
    title: "Cobrança em pagamento único",
    found: () => "O vendedor informa que a compra nesta página pede um pagamento único, sem outras cobranças futuras, e que o site usa SSL para proteger os dados.",
    attention: [
      "Isso é uma declaração comercial do vendedor sobre a cobrança nesta página.",
      "Não confirma o fabricante e não autoriza o botão comercial da Pre-sell.",
    ],
    preview: () => "Segundo o vendedor, a compra nesta página pede um pagamento único, sem outras cobranças futuras. O site declara usar SSL para proteger as informações.",
  },
  {
    id: "guarantee-60-minus-shipping",
    test: (text) => /60 full days/i.test(text) && /minus shipping/i.test(text) && /empty bottles/i.test(text) && /48 hours/i.test(text),
    title: "Garantia de 60 dias, com condições de devolução",
    found: () => "O vendedor informa garantia de reembolso de 100% em 60 dias. É preciso devolver o produto, inclusive frascos vazios, e o valor volta em até 48 horas após o retorno. Frete e taxas de manuseio não entram no reembolso.",
    attention: [
      "O reembolso não inclui frete e taxas de manuseio.",
      "O prazo de 48 horas conta após o produto devolvido chegar.",
    ],
    preview: () => "Segundo o vendedor, há garantia de reembolso de 100% em 60 dias. O produto, inclusive frascos vazios, deve ser devolvido, e o valor volta em até 48 horas após o retorno, sem incluir frete e taxas de manuseio.",
  },
];

const EXTRA_STRENGTH = /\b(garantimos a entrega|chega em|entrega garantida|sem falhas)\b/i;

export function extractComparableNumbers(text: string): string[] {
  return [...new Set([...text.matchAll(/\d+/g)].map((item) => item[0]))].sort();
}

export function hasNegation(text: string): boolean {
  return /\b(not|no|cannot|never|don't|do not|não|nao|nunca|sem)\b/i.test(text);
}

export function previewVersionOf(input: { candidateId: string; version: number; original: string; preview: string }): string {
  const raw = `${input.candidateId}|${input.version}|${input.original}|${input.preview}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pv-${(hash >>> 0).toString(16)}`;
}

export function validateSafeTranslation(original: string, preview: string): { safe: boolean; reason: string | null } {
  if (!preview.trim()) return { safe: false, reason: "A prévia está vazia." };
  if (!/^segundo (o vendedor|a página comercial)/i.test(preview)) return { safe: false, reason: "A prévia precisa atribuir a informação ao vendedor." };
  if (EXTRA_STRENGTH.test(preview) && !EXTRA_STRENGTH.test(original)) {
    return { safe: false, reason: "A prévia fortalece a afirmação além da fonte." };
  }
  if (/\b100%\b/i.test(preview) && !/\b100%\b/i.test(original)) {
    return { safe: false, reason: "A prévia fortalece a afirmação além da fonte." };
  }
  const originalNumbers = extractComparableNumbers(original);
  const previewNumbers = extractComparableNumbers(preview);
  if (originalNumbers.join(",") !== previewNumbers.join(",")) {
    return { safe: false, reason: "A prévia não preserva os números da fonte." };
  }
  if (hasNegation(original) && !hasNegation(preview)) {
    return { safe: false, reason: "A prévia perdeu uma negação da fonte." };
  }
  if (/\bdeliver(y|ed)?\b/i.test(original) === false && /\bentrega\b/i.test(preview) && /1-2|1 a 2/.test(preview) && /prepar/i.test(original)) {
    return { safe: false, reason: "A prévia transformou preparação em entrega." };
  }
  return { safe: true, reason: null };
}

export function sourceLineOf(input: {
  sourceHost: string;
  sourceUrl: string;
  primaryAffiliate?: boolean;
  productName?: string;
}): string {
  if (input.primaryAffiliate) {
    return input.productName
      ? `Página comercial do ${input.productName}.`
      : "Página comercial informada pelo usuário.";
  }
  const path = (() => {
    try {
      return new URL(input.sourceUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (/shipping/.test(path)) return `Site do vendedor — Informações de envio (${input.sourceHost || "origem não identificada"})`;
  if (/return/.test(path)) return `Site do vendedor — Política de devolução (${input.sourceHost || "origem não identificada"})`;
  if (/contact/.test(path)) return `Site do vendedor — Página de contato (${input.sourceHost || "origem não identificada"})`;
  return `Informação encontrada no site ${input.sourceHost || "não identificado"}.`;
}

export function buildReviewPresentation(input: {
  candidateId: string;
  version: number;
  extractedValue: string;
  originalExcerpt: string;
  sourceHost: string;
  sourceUrl: string;
  field?: string;
  primaryAffiliate?: boolean;
  productName?: string;
}): ReviewPresentation {
  const original = (input.extractedValue && input.extractedValue.length >= (input.originalExcerpt || "").length
    ? input.extractedValue
    : input.originalExcerpt || input.extractedValue).replace(/\s+/g, " ").trim();
  const theme = primaryOperationalTheme(original, input.field ?? "faq");
  const template = TEMPLATES.find((item) => item.test(original));
  if (!template) {
    return {
      candidateId: input.candidateId,
      version: input.version,
      theme,
      group: reviewGroupOf(theme),
      title: "Informação operacional do vendedor",
      found: "Esta informação precisa de tradução antes da aprovação.",
      source: sourceLineOf(input),
      attention: ["O texto original em inglês permanece disponível nos detalhes técnicos."],
      preview: "",
      previewVersion: previewVersionOf({ candidateId: input.candidateId, version: input.version, original, preview: "" }),
      translationSafe: false,
      unsafeReason: "Esta informação precisa de tradução antes da aprovação.",
      original,
    };
  }
  const preview = template.preview(original);
  const check = validateSafeTranslation(original, preview);
  return {
    candidateId: input.candidateId,
    version: input.version,
    theme,
    group: reviewGroupOf(theme),
    title: template.title,
    found: template.found(original),
    source: sourceLineOf(input),
    attention: template.attention,
    preview: check.safe ? preview : "",
    previewVersion: previewVersionOf({ candidateId: input.candidateId, version: input.version, original, preview: check.safe ? preview : "" }),
    translationSafe: check.safe,
    unsafeReason: check.safe ? null : check.reason,
    original,
  };
}

export function presentationMatchesApproval(input: {
  presented: ReviewPresentation;
  expectedVersion: number;
  expectedPreviewVersion?: string;
}): { ok: boolean; reason: string } {
  if (input.presented.version !== input.expectedVersion) return { ok: false, reason: "VERSION_CONFLICT" };
  if (input.expectedPreviewVersion && input.expectedPreviewVersion !== input.presented.previewVersion) {
    return { ok: false, reason: "PREVIEW_VERSION_CONFLICT" };
  }
  if (!input.presented.translationSafe || !input.presented.preview) return { ok: false, reason: "UNSAFE_TRANSLATION" };
  return { ok: true, reason: "MATCH" };
}
