import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import { relatedHostEvidence } from "@/lib/campaign-sources/related-hosts";
import { readPrimaryAffiliatePage } from "@/lib/campaign-sources/primary-page";
import { readCampaignSources } from "@/lib/campaign-sources/store";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchRun } from "@/lib/product-research/types";
import type { LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import {
  classifySourceIdentity,
  confirmSourceIdentity,
  isGenericHostConfirmation,
  type SourceIdentityRecord,
  type SourceIdentityReview,
  type SourceIdentityState,
} from "@/lib/presell-quality/source-identity";

export const ENTITY_KINDS = [
  "PRODUCT",
  "BRAND",
  "SELLER",
  "WEBSITE",
  "AFFILIATE_PROGRAM",
  "CHECKOUT_PROVIDER",
  "AFFILIATE_NETWORK",
  "UNKNOWN",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const RELATION_TYPES = [
  "SELLS",
  "MANUFACTURES",
  "OPERATES",
  "PROMOTES_AS_AFFILIATE",
  "CHECKOUT_FOR",
  "TRACKS_VIA",
  "RELATED_BY_TOKEN",
  "LOOKALIKE_OF",
  "POLICY_OF",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const RELATION_SCOPES = ["SELLER", "MANUFACTURER", "AFFILIATE", "CHECKOUT", "NETWORK", "UNKNOWN"] as const;
export type RelationScope = (typeof RELATION_SCOPES)[number];

export type CommercialEntity = {
  id: string;
  kind: EntityKind;
  label: string;
  host: string | null;
};

export type RelationEvidence = {
  id: string;
  url: string;
  excerpt: string;
  collectedAt: string | null;
  selfDeclared: boolean;
};

export type CommercialRelation = {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  scope: RelationScope;
  state: SourceIdentityState;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: RelationEvidence[];
  confirmedByHuman: boolean;
  confirmedAt: string | null;
  notes: string[];
};

export type CommercialGraph = {
  campaignId: number;
  entities: CommercialEntity[];
  relations: CommercialRelation[];
};

const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;
const CLONE_HOST = /vercel\.app|colibrim\.ai/i;
const SELLER_OPERATIONAL_FIELDS = new Set(["description", "ingredients", "howItWorks", "guarantee", "warnings", "faq"]);
const MANUFACTURER_FIELDS = new Set(["manufacturer", "pricing"]);

function publicHost(host: string): string {
  const value = host.toLowerCase();
  if (HOP_HOST.test(value)) return "hop.clickbank.net";
  return value;
}

function hostOf(url: string | null | undefined): string {
  try {
    return url ? publicHost(new URL(url).hostname) : "";
  } catch {
    return "";
  }
}

function safeUrl(url: string | null | undefined): string {
  if (!url) return "";
  const cleaned = sanitizeSharedUrl(url);
  try {
    const parsed = new URL(cleaned);
    if (HOP_HOST.test(parsed.hostname)) return "https://hop.clickbank.net/";
    if (/\/(cart|checkout|payment|order-now|ordernow|buy-now|buynow)/i.test(parsed.pathname)) {
      return `${parsed.origin}${parsed.pathname}`;
    }
    return cleaned;
  } catch {
    return cleaned;
  }
}

export function isSellerOperationalField(field: string): boolean {
  return SELLER_OPERATIONAL_FIELDS.has(field);
}

export function isManufacturerField(field: string): boolean {
  return MANUFACTURER_FIELDS.has(field);
}

export function sellerReviewAllowed(input: {
  field: string;
  host: string;
  relations: CommercialRelation[];
  identityRole?: string | null;
}): { allowed: boolean; reason: string } {
  const host = input.host.toLowerCase();
  if (!host) return { allowed: false, reason: "Host is missing." };
  if (input.identityRole === "CLONE" || CLONE_HOST.test(host)) {
    return { allowed: false, reason: "Lookalike or hosted-clone hosts are not seller identity." };
  }
  const hostRelations = input.relations.filter((item) => item.to === `website:${host}` || item.from === `website:${host}`);
  if (hostRelations.some((item) => item.type === "CHECKOUT_FOR" || item.type === "TRACKS_VIA") && !hostRelations.some((item) => item.type === "SELLS" || item.type === "PROMOTES_AS_AFFILIATE")) {
    return { allowed: false, reason: "Checkout or tracking hosts are not seller-information sources." };
  }
  if (isManufacturerField(input.field)) {
    const verifiedMaker = hostRelations.some((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED");
    return verifiedMaker
      ? { allowed: true, reason: "Verified manufacturer relationship." }
      : { allowed: false, reason: "Manufacturer fields require a verified manufacturer relationship." };
  }
  if (!isSellerOperationalField(input.field)) {
    return { allowed: false, reason: "This field is not a seller-operational review field." };
  }
  const sellerish = hostRelations.filter((item) => item.scope === "SELLER" || item.scope === "AFFILIATE");
  if (!sellerish.length) return { allowed: false, reason: "No documented seller or affiliate relationship." };
  if (sellerish.some((item) => item.state === "CONTRADICTED")) return { allowed: false, reason: "The commercial relationship is contradicted." };
  const confirmed = sellerish.some((item) => item.confirmedByHuman && (item.scope === "SELLER" || item.scope === "AFFILIATE"));
  const documented = sellerish.some((item) => item.state === "PARTIALLY_SUPPORTED" || item.state === "VERIFIED");
  if (confirmed || documented) return { allowed: true, reason: "Seller/affiliate relationship is documented. This is not manufacturer identity." };
  return { allowed: false, reason: "Seller relationship remains unresolved." };
}

export function buildCommercialGraph(input: {
  campaignId: number;
  productName?: string;
  run?: ProductResearchRun | null;
  candidates?: LedgerCandidate[];
}): CommercialGraph {
  const sources = readCampaignSources(input.campaignId);
  const accepted = acceptedProposals(input.run ?? null);
  const acceptedHosts = [...new Set(accepted.map((item) => hostOf(item.sourceUrl)).filter(Boolean))];
  const primaryHost = readPrimaryAffiliatePage(input.campaignId)?.host;
  const primaryAffiliateHosts = primaryHost ? [primaryHost] : [];
  const entities = new Map<string, CommercialEntity>();
  const relations: CommercialRelation[] = [];
  const productId = `product:${input.campaignId}`;
  entities.set(productId, { id: productId, kind: "PRODUCT", label: input.productName || `Campaign ${input.campaignId}`, host: null });

  function addHost(host: string, kind: EntityKind = "WEBSITE"): CommercialEntity {
    const id = `website:${host}`;
    if (!entities.has(id)) entities.set(id, { id, kind, label: host, host });
    return entities.get(id)!;
  }

  function addRelation(partial: Omit<CommercialRelation, "id"> & { id?: string }) {
    const id = partial.id ?? `${partial.type}:${partial.from}->${partial.to}`;
    if (relations.some((item) => item.id === id)) return;
    relations.push({ ...partial, id });
  }

  for (const source of sources) {
    const report = classifyUrlRoles(source.originalUrl);
    const host = publicHost(report.host || hostOf(source.originalUrl));
    if (!host) continue;
    const url = safeUrl(source.originalUrl);
    if (HOP_HOST.test(host)) {
      addHost(host, "AFFILIATE_NETWORK");
      addRelation({
        from: productId,
        to: `website:${host}`,
        type: "TRACKS_VIA",
        scope: "NETWORK",
        state: "UNRESOLVED",
        confidence: "HIGH",
        evidence: [{ id: source.sourceId, url, excerpt: "Affiliate tracking host. Not a research or manufacturer page.", collectedAt: source.fetchedAt, selfDeclared: false }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["Tracking hops are not seller or manufacturer identity."],
      });
      continue;
    }
    if (report.checkout) {
      addHost(host, "CHECKOUT_PROVIDER");
      addRelation({
        from: productId,
        to: `website:${host}`,
        type: "CHECKOUT_FOR",
        scope: "CHECKOUT",
        state: "UNRESOLVED",
        confidence: "MEDIUM",
        evidence: [{ id: source.sourceId, url, excerpt: "Checkout or order-now path. Not used as a commercial CTA.", collectedAt: source.fetchedAt, selfDeclared: false }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["A checkout operator is not the manufacturer."],
      });
      if (source.origin === "USER_PROVIDED") {
        addRelation({
          from: productId,
          to: `website:${host}`,
          type: "PROMOTES_AS_AFFILIATE",
          scope: "AFFILIATE",
          state: "PARTIALLY_SUPPORTED",
          confidence: "MEDIUM",
          evidence: [{
            id: `${source.sourceId}-primary`,
            url,
            excerpt: "User-provided primary affiliate landing page. Read-only. Not manufacturer identity.",
            collectedAt: source.fetchedAt,
            selfDeclared: true,
          }],
          confirmedByHuman: false,
          confirmedAt: null,
          notes: [
            "The operator supplied this URL as the commercial page to research.",
            "Read access is not commercial authorization.",
            "Confirming this affiliate page does not confirm the manufacturer.",
          ],
        });
      }
      continue;
    }
    addHost(host, "WEBSITE");
    const identity = classifySourceIdentity({
      host,
      acceptedSellerHosts: acceptedHosts,
      primaryAffiliateHosts,
      sourceClass: source.sourceClassification || source.sourceType,
    });
    if (report.roles.includes("AFFILIATE_RESOURCE_PAGE") || source.sourceType === "AFFILIATE_RESOURCE") {
      addRelation({
        from: productId,
        to: `website:${host}`,
        type: "PROMOTES_AS_AFFILIATE",
        scope: "AFFILIATE",
        state: identity.state === "VERIFIED" ? "PARTIALLY_SUPPORTED" : identity.state,
        confidence: acceptedHosts.includes(host) ? "HIGH" : "MEDIUM",
        evidence: [{ id: source.sourceId, url, excerpt: "Affiliate-resource or seller information page.", collectedAt: source.fetchedAt, selfDeclared: true }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["Affiliate-program materials are seller-stated. They do not prove manufacturer identity."],
      });
    }
    if (report.roles.includes("SELLER_INFORMATION_PAGE") || report.roles.includes("SALES_LANDING_PAGE") || acceptedHosts.includes(host)) {
      addRelation({
        from: productId,
        to: `website:${host}`,
        type: "SELLS",
        scope: "SELLER",
        state: acceptedHosts.includes(host) ? "PARTIALLY_SUPPORTED" : identity.state,
        confidence: acceptedHosts.includes(host) ? "HIGH" : "MEDIUM",
        evidence: [{
          id: `${source.sourceId}-seller`,
          url,
          excerpt: acceptedHosts.includes(host)
            ? "Accepted seller-stated facts already cite this host."
            : "Sales or seller-information page.",
          collectedAt: source.fetchedAt,
          selfDeclared: !acceptedHosts.includes(host),
        }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["A seller information site is not the manufacturer site unless independently proven."],
      });
    }
    if (report.roles.includes("SELLER_INFORMATION_PAGE") && /privacy|terms|return|shipping|contact/i.test(report.path || "")) {
      addRelation({
        from: `website:${host}`,
        to: productId,
        type: "POLICY_OF",
        scope: "SELLER",
        state: "PARTIALLY_SUPPORTED",
        confidence: "MEDIUM",
        evidence: [{ id: `${source.sourceId}-policy`, url, excerpt: "Policy or contact page on the seller-information host.", collectedAt: source.fetchedAt, selfDeclared: true }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["Self-published policies are seller-stated."],
      });
    }
  }

  for (const host of acceptedHosts) {
    addHost(host, "WEBSITE");
    addRelation({
      from: productId,
      to: `website:${host}`,
      type: "SELLS",
      scope: "SELLER",
      state: "PARTIALLY_SUPPORTED",
      confidence: "HIGH",
      evidence: [{
        id: `accepted-host-${host}`,
        url: "",
        excerpt: "Accepted seller-stated facts already cite this host. This is not manufacturer verification.",
        collectedAt: null,
        selfDeclared: true,
      }],
      confirmedByHuman: false,
      confirmedAt: null,
      notes: ["An accepted-fact host is a documented seller source, not a verified manufacturer."],
    });
  }

  const hosts = [...entities.values()].map((item) => item.host).filter((item): item is string => Boolean(item));
  for (let i = 0; i < hosts.length; i += 1) {
    for (let j = i + 1; j < hosts.length; j += 1) {
      const related = relatedHostEvidence(hosts[i]!, hosts[j]!);
      if (!related.related || related.confidence === "HIGH") continue;
      addRelation({
        from: `website:${related.leftHost}`,
        to: `website:${related.rightHost}`,
        type: "RELATED_BY_TOKEN",
        scope: "UNKNOWN",
        state: "UNRESOLVED",
        confidence: related.confidence,
        evidence: [{ id: `token-${related.leftHost}-${related.rightHost}`, url: "", excerpt: related.reason, collectedAt: null, selfDeclared: false }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["Brand-token similarity is not common-ownership proof."],
      });
    }
  }

  for (const candidate of input.candidates ?? []) {
    const host = publicHost(candidate.sourceHost);
    if (!host) continue;
    addHost(host);
    const identity = classifySourceIdentity({
      host,
      acceptedSellerHosts: acceptedHosts,
      primaryAffiliateHosts,
      sourceClass: candidate.sourceClass,
    });
    if (identity.role === "CLONE") {
      addRelation({
        from: `website:${host}`,
        to: productId,
        type: "LOOKALIKE_OF",
        scope: "UNKNOWN",
        state: "UNRESOLVED",
        confidence: "LOW",
        evidence: [{ id: candidate.candidateId, url: candidate.sourceUrl, excerpt: "Lookalike or hosted clone is not the product seller host.", collectedAt: candidate.collectedAt, selfDeclared: true }],
        confirmedByHuman: false,
        confirmedAt: null,
        notes: ["Domain resemblance is not ownership."],
      });
    }
  }

  return { campaignId: input.campaignId, entities: [...entities.values()], relations };
}

export function rejectRelation(input: { graph: CommercialGraph; relationId: string; documentation: string }): CommercialGraph {
  return {
    ...input.graph,
    relations: input.graph.relations.map((item) =>
      item.id === input.relationId
        ? { ...item, state: "CONTRADICTED" as const, confirmedByHuman: true, confirmedAt: new Date().toISOString(), notes: [...item.notes, input.documentation] }
        : item,
    ),
  };
}

function graphFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "commercial-graph.json");
}

function identityAuditFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "identity-audit.json");
}

export type IdentityAuditEntry = {
  at: string;
  campaignId: number;
  host: string;
  action: "CONFIRM" | "REJECT" | "REQUEST_MORE_EVIDENCE" | "KEEP_PENDING";
  scope: RelationScope | null;
  relationId: string | null;
  documentation: string;
  actor: "HUMAN";
};

export function writeCommercialGraph(graph: CommercialGraph): CommercialGraph {
  mkdirSync(path.dirname(graphFile(graph.campaignId)), { recursive: true });
  writeFileSync(graphFile(graph.campaignId), `${JSON.stringify(graph, null, 2)}\n`);
  return graph;
}

export function readCommercialGraph(campaignId: number): CommercialGraph | null {
  if (!existsSync(graphFile(campaignId))) return null;
  try {
    return JSON.parse(readFileSync(graphFile(campaignId), "utf8")) as CommercialGraph;
  } catch {
    return null;
  }
}

export function readIdentityAudit(campaignId: number): IdentityAuditEntry[] {
  if (!existsSync(identityAuditFile(campaignId))) return [];
  try {
    return JSON.parse(readFileSync(identityAuditFile(campaignId), "utf8")) as IdentityAuditEntry[];
  } catch {
    return [];
  }
}

export function appendIdentityAudit(entry: IdentityAuditEntry): IdentityAuditEntry {
  const list = [...readIdentityAudit(entry.campaignId), entry];
  mkdirSync(path.dirname(identityAuditFile(entry.campaignId)), { recursive: true });
  writeFileSync(identityAuditFile(entry.campaignId), `${JSON.stringify(list, null, 2)}\n`);
  return entry;
}

function normalizeRelationId(id: string): string {
  return id.replace(/website:[^:]+\.hop\.clickbank\.net/gi, "website:hop.clickbank.net");
}

export function mergeStoredGraph(fresh: CommercialGraph, stored: CommercialGraph | null): CommercialGraph {
  if (!stored) return fresh;
  const storedById = new Map(stored.relations.map((item) => [normalizeRelationId(item.id), item]));
  return {
    ...fresh,
    relations: fresh.relations.map((item) => {
      const previous = storedById.get(item.id);
      if (!previous?.confirmedByHuman) return item;
      return {
        ...item,
        confirmedByHuman: true,
        confirmedAt: previous.confirmedAt,
        state: previous.state,
        notes: [...new Set([...item.notes, ...previous.notes])],
      };
    }),
  };
}

export type SourceIdentityPanelRow = {
  host: string;
  identityFound: string;
  relationToProduct: string;
  evidence: RelationEvidence[];
  confidence: string;
  state: SourceIdentityState;
  pending: string[];
  confirmedScopes: RelationScope[];
  relationIds: string[];
  availableActions: Array<"CONFIRM_SELLER" | "CONFIRM_AFFILIATE" | "REJECT_RELATION" | "REQUEST_MORE_EVIDENCE" | "KEEP_PENDING">;
};

function identityLabel(role: SourceIdentityRecord["role"] | undefined, relations: CommercialRelation[]): string {
  if (role === "MANUFACTURER") return "Fabricante confirmado";
  if (relations.some((item) => item.type === "TRACKS_VIA")) return "Rede ou hop de afiliado";
  if (relations.some((item) => item.type === "CHECKOUT_FOR")) return "Operador de checkout";
  if (role === "CLONE") return "Site semelhante ou clone hospedado";
  const seller = relations.some((item) => item.scope === "SELLER");
  const affiliate = relations.some((item) => item.scope === "AFFILIATE");
  if (seller && affiliate) return "Operador de site de venda e material de afiliados";
  if (affiliate) return "Material ou programa de afiliados";
  if (seller) return "Operador de site de venda";
  return "Identidade desconhecida";
}

export function sourceIdentityPanel(input: {
  graph: CommercialGraph;
  identities: SourceIdentityRecord[];
}): SourceIdentityPanelRow[] {
  const byHost = new Map(input.identities.map((item) => [item.host, item]));
  const hosts = [...new Set(input.graph.entities.map((item) => item.host).filter((item): item is string => Boolean(item)))];
  return hosts.map((host) => {
    const relations = input.graph.relations.filter((item) => item.to === `website:${host}` || item.from === `website:${host}`);
    const identity = byHost.get(host);
    const confirmedScopes = [...new Set(relations.filter((item) => item.confirmedByHuman).map((item) => item.scope))];
    const pending: string[] = [];
    if (!relations.some((item) => item.scope === "SELLER" && (item.state === "PARTIALLY_SUPPORTED" || item.state === "VERIFIED" || item.confirmedByHuman))) {
      pending.push("Relação de vendedor ainda não está comprovada de forma independente.");
    }
    if (!relations.some((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED")) {
      pending.push("Fabricante não está verificado. Site de venda não prova fabricante.");
    }
    if (relations.some((item) => item.type === "RELATED_BY_TOKEN")) {
      pending.push("Semelhança de domínio não prova propriedade comum.");
    }
    const cloneOrCheckout = identity?.role === "CLONE" || relations.some((item) => item.type === "CHECKOUT_FOR" || item.type === "TRACKS_VIA");
    const actions: SourceIdentityPanelRow["availableActions"] = ["REQUEST_MORE_EVIDENCE", "KEEP_PENDING"];
    if (!cloneOrCheckout && relations.some((item) => item.scope === "SELLER")) actions.unshift("CONFIRM_SELLER");
    if (!cloneOrCheckout && relations.some((item) => item.scope === "AFFILIATE")) actions.unshift("CONFIRM_AFFILIATE");
    if (relations.some((item) => item.id)) actions.push("REJECT_RELATION");
    return {
      host,
      identityFound: identityLabel(identity?.role, relations),
      relationToProduct: relations.map((item) => `${item.type} (${item.scope}, ${item.state})`).join(" · ") || "Nenhuma relação documentada",
      evidence: relations.flatMap((item) => item.evidence),
      confidence: relations.some((item) => item.confidence === "HIGH") ? "HIGH" : relations.some((item) => item.confidence === "MEDIUM") ? "MEDIUM" : "LOW",
      state: identity?.state ?? (relations.some((item) => item.state === "PARTIALLY_SUPPORTED") ? "PARTIALLY_SUPPORTED" : "UNRESOLVED"),
      pending,
      confirmedScopes,
      relationIds: relations.map((item) => item.id),
      availableActions: [...new Set(actions)],
    };
  });
}

export function applyScopedConfirmation(input: {
  graph: CommercialGraph;
  host: string;
  scope: RelationScope;
  documentation: string;
}): CommercialGraph {
  if (isGenericHostConfirmation(input.host)) {
    throw new Error("Confirm one host at a time. Generic multi-domain confirmation is blocked.");
  }
  if (input.scope === "MANUFACTURER" && !/manufacturer|official host|json-ld|organization/i.test(input.documentation)) {
    throw new Error("Manufacturer confirmation requires documented proof.");
  }
  if (input.scope === "MANUFACTURER" && CLONE_HOST.test(input.host)) {
    throw new Error("A lookalike host cannot be confirmed as manufacturer.");
  }
  if (input.scope === "CHECKOUT" || input.scope === "NETWORK" || input.scope === "UNKNOWN") {
    throw new Error("Checkout, tracking, and unknown scopes cannot be confirmed as seller or manufacturer identity.");
  }
  const host = input.host.toLowerCase();
  const now = new Date().toISOString();
  const matches = (item: CommercialRelation) => {
    const matchesHost = item.to === `website:${host}` || item.from === `website:${host}`;
    const matchesScope =
      item.scope === input.scope ||
      (input.scope === "SELLER" && item.type === "SELLS") ||
      (input.scope === "AFFILIATE" && item.type === "PROMOTES_AS_AFFILIATE") ||
      (input.scope === "MANUFACTURER" && item.type === "MANUFACTURES");
    return matchesHost && matchesScope;
  };
  const nextRelations = input.graph.relations.map((item) => {
    if (!matches(item)) return item;
    return {
      ...item,
      confirmedByHuman: true,
      confirmedAt: now,
      state: input.scope === "MANUFACTURER" ? "VERIFIED" as const : "PARTIALLY_SUPPORTED" as const,
      notes: [...item.notes, `Human confirmed scope ${input.scope}. ${input.documentation}`],
    };
  });
  if (!nextRelations.some(matches)) {
    const type: RelationType = input.scope === "MANUFACTURER" ? "MANUFACTURES" : input.scope === "AFFILIATE" ? "PROMOTES_AS_AFFILIATE" : "SELLS";
    nextRelations.push({
      id: `${type}:product:${input.graph.campaignId}->website:${host}`,
      from: `product:${input.graph.campaignId}`,
      to: `website:${host}`,
      type,
      scope: input.scope,
      state: input.scope === "MANUFACTURER" ? "VERIFIED" : "PARTIALLY_SUPPORTED",
      confidence: "MEDIUM",
      evidence: [{ id: `human-${host}`, url: "", excerpt: input.documentation, collectedAt: now, selfDeclared: true }],
      confirmedByHuman: true,
      confirmedAt: now,
      notes: [`Human confirmed scope ${input.scope}. ${input.documentation}`],
    });
  }
  const entities = input.graph.entities.some((item) => item.host === host)
    ? input.graph.entities
    : [...input.graph.entities, { id: `website:${host}`, kind: "WEBSITE" as const, label: host, host }];
  return { ...input.graph, entities, relations: nextRelations };
}

export function confirmScopedIdentity(input: {
  campaignId: number;
  host: string;
  scope: RelationScope;
  documentation: string;
  graph?: CommercialGraph;
  productName?: string;
}): { graph: CommercialGraph; identity: SourceIdentityReview } {
  if (isGenericHostConfirmation(input.host)) {
    throw new Error("Confirm one host at a time. Generic multi-domain confirmation is blocked.");
  }
  const host = input.host.toLowerCase();
  const state: SourceIdentityState = input.scope === "MANUFACTURER" ? "VERIFIED" : "PARTIALLY_SUPPORTED";
  const identity = confirmSourceIdentity({
    campaignId: input.campaignId,
    host,
    state,
    documentation: input.documentation,
  });
  const base = input.graph ?? readCommercialGraph(input.campaignId) ?? buildCommercialGraph({ campaignId: input.campaignId, productName: input.productName });
  const graph = writeCommercialGraph(applyScopedConfirmation({
    graph: base,
    host,
    scope: input.scope,
    documentation: input.documentation,
  }));
  appendIdentityAudit({
    at: new Date().toISOString(),
    campaignId: input.campaignId,
    host,
    action: "CONFIRM",
    scope: input.scope,
    relationId: graph.relations.find((item) => (item.to === `website:${host}` || item.from === `website:${host}`) && item.scope === input.scope)?.id ?? null,
    documentation: input.documentation,
    actor: "HUMAN",
  });
  return { graph, identity };
}

export function rejectScopedRelation(input: {
  campaignId: number;
  relationId: string;
  documentation: string;
  graph?: CommercialGraph;
}): CommercialGraph {
  const base = input.graph ?? readCommercialGraph(input.campaignId);
  if (!base) throw new Error("Commercial graph is missing.");
  const graph = writeCommercialGraph(rejectRelation({ graph: base, relationId: input.relationId, documentation: input.documentation }));
  const relation = graph.relations.find((item) => item.id === input.relationId);
  appendIdentityAudit({
    at: new Date().toISOString(),
    campaignId: input.campaignId,
    host: relation?.to.replace("website:", "") ?? "",
    action: "REJECT",
    scope: relation?.scope ?? null,
    relationId: input.relationId,
    documentation: input.documentation,
    actor: "HUMAN",
  });
  return graph;
}

export function requestMoreIdentityEvidence(input: {
  campaignId: number;
  host: string;
  documentation: string;
}): IdentityAuditEntry {
  if (isGenericHostConfirmation(input.host)) {
    throw new Error("Request evidence for one host at a time.");
  }
  return appendIdentityAudit({
    at: new Date().toISOString(),
    campaignId: input.campaignId,
    host: input.host.toLowerCase(),
    action: "REQUEST_MORE_EVIDENCE",
    scope: null,
    relationId: null,
    documentation: input.documentation,
    actor: "HUMAN",
  });
}
