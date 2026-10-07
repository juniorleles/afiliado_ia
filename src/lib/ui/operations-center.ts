export const operationsKpis = [
  { id: "search-today", label: "Pesquisar hoje", value: "1" },
  { id: "products-found", label: "Produtos encontrados", value: "3" },
  { id: "products-promising", label: "Produtos promissores", value: "2" },
  { id: "campaigns-test", label: "Campanhas em teste", value: "1" },
  { id: "campaigns-active", label: "Campanhas ativas", value: "1" },
] as const;

export const attentionItems = [
  "3 produtos aguardando análise",
  "2 campanhas prontas",
  "1 campanha com CTR baixo",
] as const;

export const recentActivity = [
  { id: "search", label: "Pesquisar", detail: "North Offer" },
  { id: "product", label: "Produto encontrado", detail: "Plain Offer" },
  { id: "campaign", label: "Campanha criada", detail: "Paused Test Draft" },
  { id: "report", label: "Relatório gerado", detail: "Zebra Offer" },
] as const;

export const nextAction = {
  title: "Continue analisando",
  product: "Dynamic Joint",
  href: "/produtos",
  action: "Continuar",
} as const;

export const latestOpportunities = [
  { product: "North Offer", recommendation: "Revisar", competition: "Baixa", country: "Estados Unidos" },
  { product: "Plain Offer", recommendation: "Em análise", competition: "Média", country: "Estados Unidos" },
  { product: "Zebra Offer", recommendation: "Pronto", competition: "Alta", country: "Brasil" },
] as const;

export const quickActions = [
  { href: "/pesquisa", label: "Pesquisar Mercado", primary: true },
  { href: "/campanhas", label: "Criar Campanha", primary: false },
  { href: "/produtos", label: "Ver Produtos", primary: false },
  { href: "/relatorios", label: "Ver Relatórios", primary: false },
] as const;
