export const REVIEW_STATE_LABEL: Record<string, string> = {
  READY_FOR_REVIEW: "Pronto para analisar",
  SOURCE_IDENTITY_UNRESOLVED: "Não conseguimos confirmar a origem",
  INSUFFICIENT_EVIDENCE: "Faltam informações para confirmar",
  HIGH_RISK_CLAIM: "Informação que exige comprovação adicional",
  DUPLICATE: "Informação repetida",
  ALREADY_ACCEPTED: "Aprovado",
  REJECTED: "Rejeitado",
  ACCEPTED: "Aprovado",
};

export const REVIEW_GROUP_LABEL = {
  shipping: "Envio",
  returns: "Devolução",
  refund: "Reembolso",
  other: "Outras informações",
} as const;
export type ReviewGroupId = keyof typeof REVIEW_GROUP_LABEL;

export const REVIEW_ACTION_LABEL = {
  ACCEPT: "Aprovar informação",
  REJECT: "Rejeitar",
  REQUEST_NEW_EVIDENCE: "Pedir mais informações",
  KEEP_PENDING: "Decidir depois",
} as const;

export const REVIEW_GATE_LABEL: Record<string, string> = {
  AWAITING_HUMAN_REVIEW: "Aguardando sua análise",
  APPROVED_FACTS_READY_FOR_REGENERATION: "Há informações novas aprovadas para atualizar a página",
};

export const REVIEW_IDENTITY_STATE_LABEL: Record<string, string> = {
  VERIFIED: "Confirmado",
  PARTIALLY_SUPPORTED: "Relação com o vendedor parcialmente documentada",
  UNRESOLVED: "Ainda não confirmamos este site",
  CONTRADICTED: "Há informações conflitantes sobre este site",
};

export const REVIEW_COPY = {
  summaryTitle: "Informações do produto",
  summaryHelp: "Analise as informações abaixo e escolha quais deseja utilizar na sua página. O sistema não adicionará novas informações sem sua aprovação.",
  needsDecision: "Precisa da sua decisão agora",
  stillChecking: "Informações que o sistema ainda está verificando",
  found: "O que encontramos?",
  source: "De onde veio?",
  attention: "Atenção",
  preview: "Como aparecerá na sua página?",
  question: "Você deseja utilizar essa informação na Pre-sell?",
  technical: "Ver detalhes técnicos",
  unsafe: "Esta informação precisa de tradução antes da aprovação.",
  waitingNow: "informações aguardando sua análise",
  approved: "informações aprovadas",
  extraProof: "informações que precisam de comprovação adicional",
  blocked: "informações bloqueadas por segurança",
  awaitingCount: "Aguardando análise",
  approvedCount: "Aprovados",
  rejectedCount: "Rejeitados",
  pendingCount: "Pendentes",
  identityTitle: "Origem dos sites encontrados",
  identityHelp: "Confirmar o site de venda não confirma o fabricante do produto.",
  rejectRelation: "Rejeitar vínculo",
  requestProof: "Solicitar comprovação",
  decideLater: "Decidir depois",
  confirmSeller: "Confirmar site de venda",
  confirmAffiliate: "Confirmar material de afiliado",
  primaryTitle: "Informações encontradas na página principal",
  primaryHelp: "Estas informações vieram da página comercial que você informou. Nada entra na Pre-sell sem a sua aprovação.",
  primaryFound: "informações encontradas",
  primaryFaqs: "perguntas e respostas capturadas",
  primaryCommercial: "informações comerciais",
  primaryApprovable: "podem ser analisadas agora",
  primaryProof: "precisam de comprovação adicional",
  primaryMissing: "não encontradas nesta página",
  primaryBlocked: "bloqueadas por segurança",
} as const;

export function reviewStateLabel(state: string): string {
  return REVIEW_STATE_LABEL[state] ?? "Em análise";
}

export function reviewGroupOf(theme: string): ReviewGroupId {
  if (theme === "SHIPPING" || theme === "DELIVERY" || theme === "COMMERCIAL_TERMS") return "shipping";
  if (theme === "RETURNS") return "returns";
  if (theme === "REFUND") return "refund";
  return "other";
}

export function friendlyIdentity(input: {
  host: string;
  identityFound: string;
  relationToProduct: string;
  state: string;
}): { title: string; explanation: string } {
  const relation = `${input.identityFound} ${input.relationToProduct}`.toUpperCase();
  if (/LOOKALIKE|CLONE|VERCEL|SEMELHANTE/.test(relation) || /CLONE/.test(input.identityFound.toUpperCase())) {
    return {
      title: "Site semelhante sem vínculo confirmado",
      explanation: "Encontramos um site com nome parecido, mas não temos provas de que ele pertença ao vendedor do produto.",
    };
  }
  if (/CHECKOUT/.test(relation)) {
    return {
      title: "Página de pagamento",
      explanation: "Este endereço é usado para cobrar o pedido. Ele não comprova quem fabrica o produto e não deve ser usado como fonte da página.",
    };
  }
  if (/TRACKS_VIA|HOP|RASTREAMENTO/.test(relation)) {
    return {
      title: "Link de rastreamento de afiliado",
      explanation: "Este endereço só registra o clique do anúncio. Ele não é a página do produto e não deve ser usado como fonte.",
    };
  }
  if (/VENDA|SELLER|AFILIAD/.test(relation) && input.state === "PARTIALLY_SUPPORTED") {
    return {
      title: "Site de venda com relação parcialmente documentada",
      explanation: "Este site aparece como página de venda ou material de afiliados, mas isso ainda não prova o fabricante.",
    };
  }
  if (input.state === "VERIFIED") {
    return {
      title: "Origem confirmada",
      explanation: "A relação deste site com o produto foi confirmada no escopo registrado. Isso não confirma automaticamente o fabricante.",
    };
  }
  return {
    title: "Ainda não confirmamos este site",
    explanation: "Não há provas suficientes para tratar este endereço como o vendedor ou o fabricante do produto.",
  };
}
