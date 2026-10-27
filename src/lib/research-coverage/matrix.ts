import { extractPresellItems } from "@/lib/presell-enrichment/extract";
import { classifyEvidence } from "@/lib/presell-enrichment/classify";
import { faqEntryAllowed } from "@/lib/presell-copy/faq-select";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import type { SourceFetchRecord } from "@/lib/lp-generator/types";
import { classifySourceClass, domainOf } from "@/lib/research-coverage/classify-source";
import { classifyInformationKind } from "@/lib/research-coverage/info-class";
import type { FieldDisposition, SourceCoverageRow } from "@/lib/research-coverage/types";

export function buildSourceCoverageRow(input: {
  record: SourceFetchRecord;
  source?: EnrichmentSource;
}): SourceCoverageRow {
  const html = input.source?.html ?? "";
  const classified = classifySourceClass({
    url: input.record.url,
    html: html || undefined,
    pageCategory: input.record.pageCategory,
  });
  const items = input.source ? extractPresellItems(input.source) : [];
  const fieldsRejected: FieldDisposition[] = [];
  const fieldsUsed: string[] = [];
  const fieldsFound = [...new Set(items.map((item) => item.field))];

  for (const item of items) {
    const infoClass = classifyInformationKind(item.text);
    const classifiedItem = classifyEvidence({ field: item.field, text: item.question ? `${item.question} ${item.text}` : item.text });
    const faq = item.field === "FAQ" && item.question ? faqEntryAllowed(item.question, item.text) : { ok: true as const };
    const used =
      classifiedItem.restriction === "PUBLISHABLE" || classifiedItem.restriction === "ATTRIBUTED_ONLY"
        ? faq.ok
        : false;
    if (used) fieldsUsed.push(item.field);
    else {
      fieldsRejected.push({
        field: item.field,
        text: item.text.slice(0, 180),
        infoClass,
        used: false,
        rejected: true,
        reason: !faq.ok ? faq.reason : classifiedItem.notes.join("; ") || classifiedItem.restriction,
      });
    }
  }

  let accessStatus: SourceCoverageRow["accessStatus"] = "NOT_FETCHED";
  if (input.record.ok) accessStatus = "FETCHED";
  else if (/unsafe|private|https/i.test(input.record.reason ?? "")) accessStatus = "SKIPPED_UNSAFE";
  else if (input.record.reason) accessStatus = "ACCESS_UNAVAILABLE";

  return {
    url: input.record.url,
    requestedUrl: input.record.requestedUrl,
    domain: domainOf(input.record.url),
    sourceClass: classified.sourceClass,
    publisher: classified.publisher,
    relation: classified.relation,
    retrievedAt: input.source?.retrievedAt ?? null,
    httpStatus: input.record.status,
    contentAvailable: Boolean(html),
    bytes: input.record.bytes,
    fieldsFound,
    fieldsUsed: [...new Set(fieldsUsed)],
    fieldsRejected,
    identityConfidence: classified.publisher.confidence,
    accessStatus,
    notes: classified.notes,
  };
}

export function buildSourceCoverageMatrix(
  records: SourceFetchRecord[],
  sources: EnrichmentSource[],
): SourceCoverageRow[] {
  return records.map((record) => {
    const source = sources.find((item) => item.url === record.url || item.url === record.requestedUrl);
    return buildSourceCoverageRow({ record, source });
  });
}
