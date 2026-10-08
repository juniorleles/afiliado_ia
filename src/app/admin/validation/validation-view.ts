export type PolicyTone = "success" | "warning" | "danger" | "neutral";

export type ValidationRow = {
  key: string;
  href: string;
  date: string;
  dateLabel: string;
  campaign: string;
  product: string;
  brand: string;
  score: string;
  publication: string;
  policy: string;
  policyTone: PolicyTone;
  recommendation: string;
};

export function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function dayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

export function policyShare(ready: number, review: number, blocked: number) {
  const total = ready + review + blocked;
  if (total <= 0) return "—";
  return String(Math.round((ready / total) * 100));
}

export function gateLabel(gate: string) {
  if (gate === "READY") return "Pronta";
  if (gate === "REVIEW_REQUIRED") return "Revisão necessária";
  if (gate === "BLOCKED" || gate === "FAILED") return "Falha";
  return "Sem leitura";
}

export function gateTone(gate: string): PolicyTone {
  if (gate === "READY") return "success";
  if (gate === "REVIEW_REQUIRED") return "warning";
  if (gate === "BLOCKED" || gate === "FAILED") return "danger";
  return "neutral";
}

export function scoreClass(tone: PolicyTone) {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-foreground";
}

export function brandFromFacts(json: string | null | undefined) {
  if (!json) return "Não observada";
  try {
    const parsed = JSON.parse(json) as { manufacturer?: string | null };
    const brand = parsed.manufacturer?.trim();
    return brand || "Não observada";
  } catch {
    return "Não observada";
  }
}

export function publicationPhrase(gate: string) {
  if (gate === "READY") return "Pronta para publicar";
  if (gate === "BLOCKED") return "Bloqueada";
  if (gate === "REVIEW_REQUIRED") return "Revisão necessária";
  return "Sem leitura";
}
