import { AppSettings } from "@/lib/app-settings";
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || AppSettings.url;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/temp/", "/uploads/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
