import type { MetadataRoute } from "next";
import { publicAbsoluteUrl } from "@/lib/public-site";

/** The sitemap origin comes from the host's PUBLIC_SITE_URL, not the build machine's. */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/visual-frame", "/preview", "/api/"],
    },
    sitemap: publicAbsoluteUrl("/sitemap.xml"),
  };
}
