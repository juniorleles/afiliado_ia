export function wordCount(text: string): number {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

export function isFactDumpHeadline(text: string): boolean {
  const lower = text.toLowerCase();
  const bottleMentions = lower.match(/\bbottles?\b/g)?.length ?? 0;
  const enumeratesPackages = bottleMentions >= 2 || /\d+\s+bottles?.+\d+\s+bottles?/i.test(text);
  const mixesGuarantee = /\b(refund|guarantee|60-day|60 day)\b/i.test(text);
  const concatenates = /—/.test(text) && enumeratesPackages;
  return enumeratesPackages && (mixesGuarantee || concatenates);
}
