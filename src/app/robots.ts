import type { MetadataRoute } from "next";
import { publicAbsoluteUrl } from "@/lib/public-site";

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
