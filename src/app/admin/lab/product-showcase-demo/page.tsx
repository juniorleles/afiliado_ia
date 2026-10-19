import type { Metadata } from "next";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import { DEMO_FORMAT, DEMO_HERO, DEMO_INGREDIENTS, demoDocument } from "@/lib/product-showcase/demo-art";
import { buildProductShowcase } from "@/lib/product-showcase/model";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Product showcase demo",
  robots: { index: false, follow: false },
};

export default function ProductShowcaseDemoPage() {
  const model = buildProductShowcase(demoDocument(), {
    mode: "demo",
    image: DEMO_HERO,
    ingredientImages: DEMO_INGREDIENTS,
    formatImage: DEMO_FORMAT,
    siteName: "Demo Reviews",
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: isHealthDisclaimerEnabled() ? HEALTH_DISCLAIMER_TEXT : null,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
  });

  return <ProductShowcasePremiumV1 model={model} labHref="/admin/lab/product-showcase/cholibrium" />;
}
