import { Helmet } from "react-helmet-async";
import { AppSettings } from "@/lib/app-settings";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: "website" | "article";
}

export function SEOHead({
  title,
  description,
  keywords = [],
  image = "/og-image.png",
  url = "/",
  type = "website",
}: SEOHeadProps) {
  const fullTitle = title
    ? `${title} | ${AppSettings.name}`
    : `${AppSettings.name} - Convert Images, Videos & Audio Files Online Free`;

  const fullDescription =
    description ||
    "Free online file converter supporting 50+ formats. Convert images (JPG, PNG, WebP), videos (MP4, AVI, MOV), audio (MP3, WAV, FLAC) and documents instantly. No credit card required, privacy-first approach.";

  const fullKeywords = [
    ...keywords,
    "file converter",
    "online converter",
    "image converter",
    "video converter",
    "audio converter",
    "document converter",
    "JPG to PNG",
    "MP4 converter",
    "MP3 converter",
    "free converter",
    "batch converter",
    "format converter",
  ].join(", ");

  const fullUrl = `${AppSettings.url}${url.startsWith("/") ? url.slice(1) : url}`;
  const fullImage = image.startsWith("http")
    ? image
    : `${AppSettings.url}${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={fullDescription} />
      <meta name="keywords" content={fullKeywords} />
      <meta name="author" content={AppSettings.author.name} />
      <meta name="creator" content={AppSettings.author.name} />
      <meta name="publisher" content={AppSettings.author.name} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:site_name" content={AppSettings.name} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content={`${AppSettings.name} - Convert any file format online`}
      />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={fullImage} />
      <meta name="twitter:creator" content={AppSettings.author.name} />

      {/* Canonical URL */}
      <link rel="canonical" href={fullUrl} />
    </Helmet>
  );
}
