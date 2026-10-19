export function LandingDocumentSchema({ schema }: { schema: Record<string, unknown> | null }) {
  if (!schema) return null;
  const payload = { "@context": "https://schema.org", ...schema };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }} />;
}
