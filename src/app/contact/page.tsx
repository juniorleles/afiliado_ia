import type { Metadata } from "next";
import { PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicContactEmail, getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/contact",
  "Contact",
  "How to reach the publisher of these product reviews.",
);

export default function ContactPage() {
  const site = getPublicSiteName();
  const email = getPublicContactEmail();

  return (
    <PublicLegalLayout title="Contact">
      <p>
        For questions about {site}, a review page, or privacy, email the
        address below. There is no contact form and no automated ticket system
        on this site.
      </p>
      <p>
        Email:{" "}
        <a href={`mailto:${email}`} className="text-emerald-400 hover:underline">
          {email}
        </a>
      </p>
      <p className="text-sm text-zinc-500">
        This address is configured by the site operator (
        <code className="rounded bg-zinc-800 px-1 text-zinc-300">PUBLIC_CONTACT_EMAIL</code>
        ). We cannot respond to product-warranty, shipping, or refund requests
        for third-party merchants — contact the seller directly for those.
      </p>
    </PublicLegalLayout>
  );
}
