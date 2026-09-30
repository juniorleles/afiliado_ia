/**
 * PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1
 *
 * MODEL wording must cite authorized proposition IDs. The ID is only a
 * candidate boundary. Wording still has to pass the existing wording,
 * relationship, and slot-authority checks against that proposition text.
 * THIN does not use this contract.
 */

import type { EvidenceSlot } from "@/lib/ai/evidence-slot-plan";
import { unsupportedRelationalExpansions } from "@/lib/ai/ingredient-claims";
import { checkModelWordingConstraint } from "@/lib/ai/model-wording-constraint";
import { validateModelSlotAuthority } from "@/lib/ai/model-slot-authority";
import {
  atomicOperationalSentences,
  causalRelationInEvidence,
  droppedOptionality,
  unsupportedPropositionTransfers,
} from "@/lib/ai/operational-relations";

/** Operational evidence is cited sentence by sentence; each sentence keeps its own relations. */
const OPERATIONAL_FIELDS = new Set(["returnsInformation", "shippingInformation"]);
const OPERATIONAL_SLOT_TYPES = new Set(["RETURNS", "SHIPPING"]);

/** Operational slots realize each wording from exactly one proposition. */
export function isOperationalSlot(slot: Pick<EvidenceSlot, "type" | "evidence">): boolean {
  return OPERATIONAL_SLOT_TYPES.has(slot.type) || slot.evidence.some((item) => OPERATIONAL_FIELDS.has(item.field));
}

export const OPERATIONAL_ISOLATION_PROMPT =
  "OPERATIONAL SLOTS (type=RETURNS, SHIPPING): each wording cites exactly ONE propositionId and realizes only that proposition. Never combine two operational propositions into one wording, even within the same slot; use one wording per proposition. Keep that proposition's own subject, duration, fee, destination, condition, exception, and optionality ((optional), if available, when available, where applicable). Never move any of them to or from another proposition.";
import type { GenerationPlan } from "@/lib/ai/generation-plan";

export const PROPOSITION_SHAPES = ["STATEMENT", "ENTITY_ONLY"] as const;

export type PropositionShape = (typeof PROPOSITION_SHAPES)[number];

export type AuthorizedProposition = {
  propositionId: string;
  claimId: string;
  evidenceId: string;
  field: string;
  subject: string;
  relation: string;
  object: string;
  sourceText: string;
  shape: PropositionShape;
};

export type BoundWording = {
  propositionId?: string;
  propositionIds?: string[];
  wording: string;
};

type Decomposed = {
  subject: string;
  relation: string;
  object: string;
  sourceText: string;
};

const ABSENT_RELATION =
  /\bwork(?:s|ing)? together\b|\bworks with\b|\bcomplements?\b|\benhances?\b|\bcauses?\b|\bleads to\b|\bresults in\b|\brepairs?\b|\bheals?\b|\bcures?\b|\btreats?\b|\brecommended by\b|\bmanufactured by\b/gi;

function normalizeReciprocal(text: string): string {
  return text.replace(/\bone another\b/gi, "each other");
}

function decomposeEvidenceText(text: string): Decomposed[] {
  const original = text.trim();
  const stripped = original.replace(/^see how\s+/i, "");
  const match = stripped.match(/^(.*?)\bsupports\s+(.+)$/i);
  if (!match) {
    return [{ subject: "", relation: "restatement", object: original, sourceText: original }];
  }
  const subject = (match[1] || "").trim();
  let rest = (match[2] || "").trim().replace(/[.]+$/, "");
  let withObject = "";
  const withMatch = rest.match(/^(.*?)\s+with\s+([^.]{1,80})$/i);
  if (withMatch && !/\b(?:support|work|cause|lead|result|repair|heal|cure|treat)\b/i.test(withMatch[2] || "")) {
    rest = (withMatch[1] || "").trim();
    withObject = (withMatch[2] || "").trim();
  }
  const objects = rest
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    objects.length === 0 ||
    objects.some((item) => /\b(?:work|cause|repair|heal|cure|treat|complement|enhance)\b/i.test(item))
  ) {
    return [{ subject, relation: "restatement", object: original, sourceText: original }];
  }
  const parts = objects.map((object) => ({
    subject,
    relation: "supports",
    object,
    sourceText: `${subject ? `${subject} ` : ""}supports ${object}`.trim(),
  }));
  if (withObject) {
    parts.push({
      subject,
      relation: "described-with",
      object: withObject,
      sourceText: withObject,
    });
  }
  return parts;
}

/** A clause boundary, not an abbreviation dot inside a token such as "B.lactis X". */
const SENTENCE_BOUNDARY = /[.!?](?:\s|$)/;

/** Closed-class verbal markers. A finite clause in English needs one of these or a full stop. */
const CLAUSE_MARKER =
  /\b(?:am|is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|may|might|shall|should|will|would|must)\b/i;

/**
 * Structural shape of a citable unit.
 *
 * ENTITY_ONLY is a bare label with no clause ("Peppermint"). It authorizes the
 * entity itself and no predicate about it, so a slot may be answered with the
 * label alone. STATEMENT is the conservative default: misreading a label as a
 * statement only keeps the existing sentence contract, while the reverse adds a
 * restriction, so neither direction grants the model new meaning. Classification
 * reads punctuation and closed-class words only, never the field or the name.
 */
export function propositionShape(text: string): PropositionShape {
  const trimmed = (text || "").trim();
  if (!trimmed) return "STATEMENT";
  if (SENTENCE_BOUNDARY.test(trimmed) || CLAUSE_MARKER.test(trimmed)) return "STATEMENT";
  return "ENTITY_ONLY";
}

function shapeOfPart(part: Decomposed): PropositionShape {
  return part.relation === "supports" ? "STATEMENT" : propositionShape(part.sourceText);
}

/** The shape of a whole projected evidence value, which may decompose into several propositions. */
export function evidenceTextShape(text: string): PropositionShape {
  const parts = decomposeEvidenceText(text);
  return parts.length > 0 && parts.every((part) => shapeOfPart(part) === "ENTITY_ONLY") ? "ENTITY_ONLY" : "STATEMENT";
}

/**
 * CANONICAL PROPOSITION IDENTITY
 *
 * A proposition is the citable unit of one projected evidence item, and its
 * text is that item's projected text. Claims are the span classification of the
 * same evidence and are frequently partial ("180-day return policy", "Take
 * one"), so a claim is not independently citable and never gets its own
 * proposition. An item's propositions are anchored to its lowest authorized
 * claim id, which is stable under claim reordering because the id is sorted,
 * not taken from array position. Any other claim id of the item is in-scope for
 * authority and is covered by that proposition's text, but is not a citable id.
 */
export function propositionsForSlot(slot: EvidenceSlot): AuthorizedProposition[] {
  const propositions: AuthorizedProposition[] = [];
  for (const item of slot.evidence) {
    const claimId =
      [...slot.allowedClaimIds].filter((id) => id.startsWith(`${item.id}:`)).sort()[0] || item.id;
    const parts: Decomposed[] = OPERATIONAL_FIELDS.has(item.field)
      ? atomicOperationalSentences(item.value).map((sentence) => ({
          subject: "",
          relation: "restatement",
          object: sentence,
          sourceText: sentence,
        }))
      : decomposeEvidenceText(item.value);
    parts.forEach((part, index) => {
      propositions.push({
        propositionId: `${claimId}:P${index + 1}`,
        claimId,
        evidenceId: item.id,
        field: item.field,
        subject: part.subject,
        relation: part.relation,
        object: part.object,
        sourceText: part.sourceText,
        shape: shapeOfPart(part),
      });
    });
  }
  return propositions;
}

export function authorizedPropositionGroups(
  slots: EvidenceSlot[],
): Array<{ slotId: string; propositions: AuthorizedProposition[] }> {
  return slots.map((slot) => ({ slotId: slot.slotId, propositions: propositionsForSlot(slot) }));
}

export function formatAuthorizedPropositionGroups(
  groups: Array<{ slotId: string; propositions: AuthorizedProposition[] }>,
): string {
  const lines = [
    "AUTHORIZED PROPOSITIONS — cite these propositionIds. Do not invent proposition IDs.",
    "This list is complete. A claim ID with no proposition here has no citable proposition: never build one from a claim ID.",
    "Return propositionIds plus wording. A proposition ID is not permission to add a new relation.",
    "FAQ slots return answerPropositions only. CODE assigns the question. Do not return unbound content.",
    "A proposition marked shape=ENTITY_ONLY authorizes only that entity text. The wording may be the entity alone and does not have to be a sentence.",
    "Never add a predicate to it (is described, contains, supports, is the main one) unless another cited proposition states it. List several entities only when each one is cited.",
  ];
  if (groups.some((group) => group.propositions.some((item) => OPERATIONAL_FIELDS.has(item.field)))) {
    lines.push(OPERATIONAL_ISOLATION_PROMPT);
  }
  for (const group of groups) {
    for (const proposition of group.propositions) {
      const shape = proposition.shape === "ENTITY_ONLY" ? " shape=ENTITY_ONLY" : "";
      lines.push(
        `PROPOSITION ${proposition.propositionId} slot=${group.slotId} field=${proposition.field} relation=${proposition.relation}${shape} :: ${proposition.sourceText}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatAuthorizedPropositionsForPrompt(slots: EvidenceSlot[]): string {
  return formatAuthorizedPropositionGroups(authorizedPropositionGroups(slots));
}

function boundSupport(selected: AuthorizedProposition[]): string {
  const lines = selected.map((item) => item.sourceText);
  const supports = selected.filter((item) => item.relation === "supports" && item.subject);
  const subject = supports[0]?.subject || "";
  if (subject && supports.length >= 2 && supports.every((item) => item.subject === subject)) {
    const objects = supports.map((item) => item.object);
    lines.push(`${subject} supports ${objects.join(" and ")}`);
    lines.push(`${subject} supports ${[...objects].reverse().join(" and ")}`);
    lines.push(`It supports ${objects.join(" and ")}`);
  }
  for (const item of supports) {
    lines.push(`It supports ${item.object}`);
  }
  return lines.join("\n");
}

function citedIds(item: BoundWording): string[] {
  const many = (item.propositionIds || []).map((id) => id.trim()).filter(Boolean);
  if (many.length) return many;
  const one = item.propositionId?.trim();
  return one ? [one] : [];
}

function relationAbsentFromSupport(wording: string, support: string): string | null {
  const flags = ABSENT_RELATION.flags.includes("g") ? ABSENT_RELATION.flags : `${ABSENT_RELATION.flags}g`;
  const re = new RegExp(ABSENT_RELATION.source, flags);
  const supportNorm = normalizeReciprocal(support).toLowerCase();
  let match = re.exec(wording);
  while (match) {
    const span = match[0];
    let sentence = wording;
    let cursor = 0;
    for (const part of wording.split(/(?<=[.!?])\s+/)) {
      const start = wording.indexOf(part, cursor);
      cursor = start + part.length;
      if (match.index >= start && match.index < cursor) {
        sentence = part;
        break;
      }
    }
    const causalRestatement = /^causes?$/i.test(span) && causalRelationInEvidence(sentence, support);
    if (!causalRestatement && !supportNorm.includes(normalizeReciprocal(span).toLowerCase())) return span;
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(wording);
  }
  return null;
}

export function validatePropositionBindings(input: {
  fill: {
    slotId: string;
    content?: string;
    question?: string;
    answer?: string;
    propositions?: BoundWording[];
    answerPropositions?: BoundWording[];
  };
  slot: EvidenceSlot;
  slots: EvidenceSlot[];
  plan: GenerationPlan;
  productName: string;
}): Array<{ code: "PROPOSITION_BINDING_VIOLATION"; text: string; reason: string }> {
  const violations: Array<{ code: "PROPOSITION_BINDING_VIOLATION"; text: string; reason: string }> = [];
  const own = propositionsForSlot(input.slot);
  const ownIds = new Map(own.map((item) => [item.propositionId, item]));
  const authorizedSlots = new Map<string, Set<string>>();
  for (const slot of input.slots) {
    for (const proposition of propositionsForSlot(slot)) {
      const assigned = authorizedSlots.get(proposition.propositionId) ?? new Set<string>();
      assigned.add(slot.slotId);
      authorizedSlots.set(proposition.propositionId, assigned);
    }
  }
  const boundGroups = [...(input.fill.propositions || []), ...(input.fill.answerPropositions || [])];
  const hasBound = boundGroups.length > 0;
  const legacyFactual = Boolean((input.fill.content || "").trim() || (input.fill.answer || "").trim());
  if (!hasBound && legacyFactual && input.slot.type !== "FAQ") {
    violations.push({
      code: "PROPOSITION_BINDING_VIOLATION",
      text: input.fill.content || input.slot.slotId,
      reason: "UNBOUND_FACTUAL_CONTENT",
    });
  }
  if (!hasBound && input.slot.type === "FAQ" && (input.fill.answer || "").trim() && !(input.fill.answerPropositions || []).length) {
    return violations;
  }
  const seen = new Set<string>();
  const operationalSlot = isOperationalSlot(input.slot);
  for (const group of boundGroups) {
    const ids = citedIds(group);
    const wording = (group.wording || "").trim();
    if (operationalSlot && ids.length > 1) {
      violations.push({
        code: "PROPOSITION_BINDING_VIOLATION",
        text: wording || ids.join(","),
        reason: `OPERATIONAL_PROPOSITION_COMBINATION: ${ids.length} propositions (${ids.join(", ")}) in one wording; operational slots require exactly one per wording`,
      });
    }
    if (!wording || ids.length === 0) {
      violations.push({
        code: "PROPOSITION_BINDING_VIOLATION",
        text: wording || input.slot.slotId,
        reason: "UNBOUND_FACTUAL_CONTENT",
      });
      continue;
    }
    const selected: AuthorizedProposition[] = [];
    for (const id of ids) {
      if (seen.has(id)) {
        violations.push({
          code: "PROPOSITION_BINDING_VIOLATION",
          text: id,
          reason: "DUPLICATE_PROPOSITION_BINDING",
        });
        continue;
      }
      seen.add(id);
      const assigned = authorizedSlots.get(id);
      const proposition = assigned?.has(input.slot.slotId) ? ownIds.get(id) : undefined;
      if (!proposition) {
        violations.push({
          code: "PROPOSITION_BINDING_VIOLATION",
          text: id,
          reason: assigned && assigned.size > 0 ? "CROSS_SLOT_PROPOSITION" : "UNKNOWN_PROPOSITION_ID",
        });
        continue;
      }
      selected.push(proposition);
    }
    if (!selected.length || !wording) continue;
    const support = boundSupport(selected);
    const compared = normalizeReciprocal(wording);
    const comparedSupport = normalizeReciprocal(support);
    const wordingResult = checkModelWordingConstraint({
      generated: compared,
      support: comparedSupport,
      slotId: input.slot.slotId,
      field: selected[0]?.field || input.slot.evidence[0]?.field || "description",
    });
    const relational = unsupportedRelationalExpansions(compared, comparedSupport);
    const absent = relationAbsentFromSupport(compared, comparedSupport);
    const authorityHits = validateModelSlotAuthority({
      copy: compared,
      slot: {
        ...input.slot,
        evidence: [
          {
            id: selected[0]?.evidenceId || input.slot.evidence[0]?.id || input.slot.slotId,
            field: selected[0]?.field || input.slot.evidence[0]?.field || "description",
            value: comparedSupport,
          },
        ],
      },
      plan: input.plan,
      productName: input.productName,
    });
    const operational = selected.some((item) => OPERATIONAL_FIELDS.has(item.field));
    const sourceTexts = selected.map((item) => item.sourceText);
    const transfers = operational ? unsupportedPropositionTransfers(wording, sourceTexts) : [];
    for (const transfer of transfers) {
      violations.push({
        code: "PROPOSITION_BINDING_VIOLATION",
        text: transfer.clause,
        reason: `RELATION_TRANSFER_${transfer.type}: ${transfer.detail}`,
      });
    }
    for (const dropped of operational ? droppedOptionality(wording, sourceTexts) : []) {
      violations.push({
        code: "PROPOSITION_BINDING_VIOLATION",
        text: dropped.clause,
        reason: `OPTIONALITY_DROPPED: "${dropped.item}" is "${dropped.marker}" in the cited proposition`,
      });
    }
    if (wordingResult.violations.length || relational.length || absent || authorityHits.length) {
      violations.push({
        code: "PROPOSITION_BINDING_VIOLATION",
        text: wording,
        reason: "UNAUTHORIZED_RELATIONSHIP",
      });
    }
  }
  return violations;
}
